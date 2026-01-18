let embeddingsPacked = null;
let verseIndices = null;
let embeddingSize = 0;
let verseIndexToRow = new Map();

self.onmessage = (event) => {
    const { type } = event.data || {};

    try {
        if (type === 'init') {
            const { embeddingsBuffer, verseIndicesBuffer, size } = event.data;
            embeddingsPacked = new Float32Array(embeddingsBuffer);
            verseIndices = new Int32Array(verseIndicesBuffer);
            embeddingSize = size;
            verseIndexToRow = new Map();
            for (let i = 0; i < verseIndices.length; i++) {
                verseIndexToRow.set(verseIndices[i], i);
            }
            self.postMessage({ type: 'ready' });
            return;
        }

        if (type === 'search') {
            const { requestId, queryEmbeddingBuffer, topK } = event.data;
            const queryEmbedding = new Float32Array(queryEmbeddingBuffer);
            const results = searchPacked(queryEmbedding, topK);
            self.postMessage({ type: 'result', requestId, results });
            return;
        }

        if (type === 'searchByVerseIndex') {
            const { requestId, verseIndex, topK, minScore } = event.data;
            const results = searchByVerseIndexPacked(verseIndex, topK, minScore);
            self.postMessage({ type: 'result', requestId, results });
            return;
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            message: error?.message || 'Worker error',
            stack: error?.stack || ''
        });
    }
};

function searchPacked(queryEmbedding, topK = 25) {
    const limit = topK === null || topK <= 0 ? null : topK;
    const results = [];

    if (limit === null) {
        for (let row = 0; row < verseIndices.length; row++) {
            const score = dotProductQueryRow(queryEmbedding, row);
            results.push({ verseIndex: verseIndices[row], score });
        }
        return results.sort((a, b) => b.score - a.score);
    }

    const heap = [];
    for (let row = 0; row < verseIndices.length; row++) {
        const score = dotProductQueryRow(queryEmbedding, row);
        if (heap.length < limit) {
            heapPush(heap, { verseIndex: verseIndices[row], score });
        } else if (score > heap[0].score) {
            heapReplaceRoot(heap, { verseIndex: verseIndices[row], score });
        }
    }

    return heap.sort((a, b) => b.score - a.score);
}

function searchByVerseIndexPacked(verseIndex, topK = 10, minScore = null) {
    const rowIndex = verseIndexToRow.get(verseIndex);
    if (rowIndex === undefined) return [];

    const limit = topK === null || topK <= 0 ? null : topK;
    const results = [];

    if (limit === null) {
        for (let row = 0; row < verseIndices.length; row++) {
            if (verseIndices[row] === verseIndex) continue;
            const score = dotProductRowRow(rowIndex, row);
            if (minScore !== null && score < minScore) continue;
            results.push({ verseIndex: verseIndices[row], score });
        }
        return results.sort((a, b) => b.score - a.score);
    }

    const heap = [];
    for (let row = 0; row < verseIndices.length; row++) {
        if (verseIndices[row] === verseIndex) continue;
        const score = dotProductRowRow(rowIndex, row);
        if (minScore !== null && score < minScore) continue;
        if (heap.length < limit) {
            heapPush(heap, { verseIndex: verseIndices[row], score });
        } else if (score > heap[0].score) {
            heapReplaceRoot(heap, { verseIndex: verseIndices[row], score });
        }
    }

    return heap.sort((a, b) => b.score - a.score);
}

function dotProductQueryRow(queryEmbedding, rowIndex) {
    const offset = rowIndex * embeddingSize;
    let sum = 0;
    for (let i = 0; i < embeddingSize; i++) {
        sum += queryEmbedding[i] * embeddingsPacked[offset + i];
    }
    return sum;
}

function dotProductRowRow(rowA, rowB) {
    const offsetA = rowA * embeddingSize;
    const offsetB = rowB * embeddingSize;
    let sum = 0;
    for (let i = 0; i < embeddingSize; i++) {
        sum += embeddingsPacked[offsetA + i] * embeddingsPacked[offsetB + i];
    }
    return sum;
}

function heapPush(heap, item) {
    heap.push(item);
    let index = heap.length - 1;
    while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (heap[parent].score <= heap[index].score) break;
        const temp = heap[parent];
        heap[parent] = heap[index];
        heap[index] = temp;
        index = parent;
    }
}

function heapReplaceRoot(heap, item) {
    heap[0] = item;
    heapify(heap, 0);
}

function heapify(heap, index) {
    const length = heap.length;
    while (true) {
        const left = index * 2 + 1;
        const right = index * 2 + 2;
        let smallest = index;

        if (left < length && heap[left].score < heap[smallest].score) {
            smallest = left;
        }
        if (right < length && heap[right].score < heap[smallest].score) {
            smallest = right;
        }
        if (smallest === index) break;
        const temp = heap[index];
        heap[index] = heap[smallest];
        heap[smallest] = temp;
        index = smallest;
    }
}
