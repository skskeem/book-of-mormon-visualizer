// Dynamic import to avoid build-time issues
let pipeline, env;

async function loadTransformers() {
    if (!pipeline || !env) {
        const ortCommon = await import('onnxruntime-common');
        if (typeof globalThis !== 'undefined' && !globalThis.ort) {
            globalThis.ort = ortCommon;
        }

        await import('onnxruntime-web');

        const transformers = await import('@xenova/transformers');
        pipeline = transformers.pipeline;
        env = transformers.env;
        
        // Ensure we load model files from HuggingFace in the browser.
        env.allowRemoteModels = true;
        env.allowLocalModels = false;
        env.remoteHost = 'https://huggingface.co/';
        env.remotePathTemplate = '{model}/resolve/{revision}/';
        env.useBrowserCache = true;
    }
    return { pipeline, env };
}

export class SemanticSearchIndex {
    constructor({ embeddingsUrl = '/embeddings.json', modelId = 'Xenova/all-MiniLM-L6-v2' } = {}) {
        this.embeddingsUrl = embeddingsUrl;
        this.modelId = modelId;
        this.embeddingSize = 0;
        this.extractor = null;
        this.embeddingsPacked = null;
        this.verseIndices = null;
        this.verseIndexToRow = new Map();
        this.worker = null;
        this.workerReady = false;
        this.workerReadyPromise = null;
        this.pendingRequests = new Map();
        this.nextRequestId = 1;
        this.workerSupported = typeof Worker !== 'undefined';
    }

    async init() {
        await this._loadEmbeddings();
        if (this.workerSupported) {
            await this._loadWorker();
        }
        await this._loadModel();
    }

    async _loadEmbeddings() {
        const response = await fetch(this.embeddingsUrl);
        if (!response.ok) {
            const error = new Error(`Semantic embeddings not found at ${this.embeddingsUrl}`);
            error.code = response.status === 404 ? 'missing' : 'fetch_failed';
            throw error;
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const error = new Error(`Embeddings response was not JSON (${contentType || 'unknown'})`);
            error.code = 'invalid_format';
            throw error;
        }
        const data = await response.json();
        if (!data || !Array.isArray(data.items)) {
            const error = new Error('Invalid embeddings file format.');
            error.code = 'invalid_format';
            throw error;
        }
        const rawItems = data.items
            .filter((item) => Array.isArray(item.embedding) && typeof item.verseIndex === 'number');
        const inferredSize = rawItems.length > 0 ? rawItems[0].embedding.length : 0;
        this.embeddingSize = data.embeddingSize || inferredSize;
        if (!this.embeddingSize || this.embeddingSize <= 0) {
            const error = new Error('Invalid embedding size in embeddings file.');
            error.code = 'invalid_format';
            throw error;
        }

        const validItems = rawItems.filter((item) => item.embedding.length === this.embeddingSize);
        const itemCount = validItems.length;
        this.embeddingsPacked = new Float32Array(itemCount * this.embeddingSize);
        this.verseIndices = new Int32Array(itemCount);
        this.verseIndexToRow.clear();

        for (let i = 0; i < itemCount; i++) {
            const item = validItems[i];
            this.verseIndices[i] = item.verseIndex;
            this.verseIndexToRow.set(item.verseIndex, i);
            this.embeddingsPacked.set(item.embedding, i * this.embeddingSize);
        }
    }

    async _loadWorker() {
        if (this.worker) return;

        this.worker = new Worker(new URL('../workers/semanticSearchWorker.js', import.meta.url), { type: 'module' });
        this.workerReady = false;
        let resolveReady = null;
        this.workerReadyPromise = new Promise((resolve) => {
            resolveReady = resolve;
        });

        this.worker.onmessage = (event) => {
            const { type } = event.data || {};
            if (type === 'ready') {
                this.workerReady = true;
                if (resolveReady) {
                    resolveReady();
                    resolveReady = null;
                }
                return;
            }
            if (type === 'result') {
                const { requestId, results } = event.data;
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                    this.pendingRequests.delete(requestId);
                    pending.resolve(results);
                }
                return;
            }
            if (type === 'error') {
                const error = new Error(event.data?.message || 'Semantic worker error');
                const pending = this.pendingRequests.get(event.data?.requestId);
                if (pending) {
                    this.pendingRequests.delete(event.data.requestId);
                    pending.reject(error);
                } else {
                    console.error('Semantic worker error:', error, event.data?.stack || '');
                }
            }
        };

        const embeddingsBuffer = this.embeddingsPacked.buffer;
        const verseIndicesBuffer = this.verseIndices.buffer;
        this.worker.postMessage({
            type: 'init',
            embeddingsBuffer,
            verseIndicesBuffer,
            size: this.embeddingSize
        }, [embeddingsBuffer, verseIndicesBuffer]);

        this.embeddingsPacked = null;
        this.verseIndices = null;
        this.verseIndexToRow.clear();

        await this.workerReadyPromise;
    }

    async _loadModel() {
        if (!this.extractor) {
            const originalFetch = typeof window !== 'undefined' ? globalThis.fetch : null;
            let fetchInterceptor = null;
            
            try {
                const { pipeline: pipelineFn, env: envObj } = await loadTransformers();
                
                // Re-apply env settings in case they were reset
                envObj.allowRemoteModels = true;
                envObj.allowLocalModels = false;
                envObj.remoteHost = 'https://huggingface.co/';
                envObj.remotePathTemplate = '{model}/resolve/{revision}/';
                envObj.useBrowserCache = true;

                // Configure ONNX backend for stability
                if (envObj.backends?.onnx?.wasm) {
                    envObj.backends.onnx.wasm.numThreads = 1;
                    envObj.backends.onnx.wasm.proxy = false;
                }
                
                // Add fetch interceptor to debug failing requests
                if (typeof window !== 'undefined') {
                    fetchInterceptor = async (...args) => {
                        const url = args[0];
                        console.log('Fetch request:', url);
                        try {
                            const response = await originalFetch(...args);
                            const contentType = response.headers.get('content-type') || '';
                            if (response.ok && !contentType.includes('application/json') && contentType.includes('text/html')) {
                                console.warn('⚠️ Got HTML instead of expected content type for:', url);
                                console.warn('This usually means Vite intercepted the request. Check if URL should be absolute.');
                            }
                            return response;
                        } catch (err) {
                            console.error('Fetch error for:', url, err);
                            throw err;
                        }
                    };
                    globalThis.fetch = fetchInterceptor;
                }
                
                console.log('Loading embedding model:', this.modelId);
                console.log('Environment settings:', {
                    allowRemoteModels: envObj.allowRemoteModels,
                    allowLocalModels: envObj.allowLocalModels,
                    remoteHost: envObj.remoteHost
                });
                
                this.extractor = await pipelineFn('feature-extraction', this.modelId, { 
                    quantized: true,
                    progress_callback: (progress) => {
                        if (progress.status === 'progress') {
                            console.log(`Model loading: ${progress.progress || 0}%`);
                        }
                    }
                });
                
                // Restore original fetch
                if (fetchInterceptor && typeof window !== 'undefined') {
                    globalThis.fetch = originalFetch;
                }
                
                console.log('Model loaded successfully');
            } catch (error) {
                // Restore original fetch on error
                if (fetchInterceptor && typeof window !== 'undefined' && originalFetch) {
                    globalThis.fetch = originalFetch;
                }
                
                console.error('Error loading model:', error);
                console.error('Model ID:', this.modelId);
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
                
                // Try to get more info about the failing request
                if (error.message && error.message.includes('JSON')) {
                    console.error('This error suggests a request returned HTML instead of JSON.');
                    console.error('This usually means Vite is intercepting a model file request.');
                    console.error('Check the Network tab above to see which URL returned HTML.');
                }
                
                throw error;
            }
        }
    }

    async embedQuery(text) {
        if (!this.extractor) {
            throw new Error('Model not loaded. Call init() first.');
        }
        const result = await this.extractor(text, { pooling: 'mean', normalize: true });
        return Float32Array.from(result.data);
    }

    async search(queryEmbedding, topK = 25) {
        if (this.worker && this.workerReady) {
            return this._requestWorker('search', { queryEmbedding, topK });
        }
        return this._searchPacked(queryEmbedding, topK);
    }

    async searchByVerseIndex(verseIndex, topK = 10, minScore = null) {
        if (this.worker && this.workerReady) {
            return this._requestWorker('searchByVerseIndex', { verseIndex, topK, minScore });
        }
        return this._searchByVerseIndexPacked(verseIndex, topK, minScore);
    }

    async searchText(text, topK = 25) {
        const embedding = await this.embedQuery(text);
        return this.search(embedding, topK);
    }

    _requestWorker(type, payload) {
        if (!this.worker) {
            return Promise.reject(new Error('Semantic worker not available'));
        }

        if (!this.workerReady && this.workerReadyPromise) {
            return this.workerReadyPromise.then(() => this._requestWorker(type, payload));
        }

        const requestId = this.nextRequestId++;
        const message = { type, requestId, ...payload };
        let transfer = [];

        if (payload?.queryEmbedding) {
            message.queryEmbeddingBuffer = payload.queryEmbedding.buffer;
            delete message.queryEmbedding;
            transfer = [message.queryEmbeddingBuffer];
        }

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });
            this.worker.postMessage(message, transfer);
        });
    }

    _searchPacked(queryEmbedding, topK = 25) {
        if (!this.embeddingsPacked || !this.verseIndices) return [];
        const limit = topK === null || topK <= 0 ? null : topK;
        const results = [];

        if (limit === null) {
            for (let row = 0; row < this.verseIndices.length; row++) {
                const score = dotProductQueryRow(queryEmbedding, this.embeddingsPacked, this.embeddingSize, row);
                results.push({ verseIndex: this.verseIndices[row], score });
            }
            return results.sort((a, b) => b.score - a.score);
        }

        const heap = [];
        for (let row = 0; row < this.verseIndices.length; row++) {
            const score = dotProductQueryRow(queryEmbedding, this.embeddingsPacked, this.embeddingSize, row);
            if (heap.length < limit) {
                heapPush(heap, { verseIndex: this.verseIndices[row], score });
            } else if (score > heap[0].score) {
                heapReplaceRoot(heap, { verseIndex: this.verseIndices[row], score });
            }
        }

        return heap.sort((a, b) => b.score - a.score);
    }

    _searchByVerseIndexPacked(verseIndex, topK = 10, minScore = null) {
        if (!this.embeddingsPacked || !this.verseIndices) return [];
        const rowIndex = this.verseIndexToRow.get(verseIndex);
        if (rowIndex === undefined) return [];

        const limit = topK === null || topK <= 0 ? null : topK;
        const results = [];

        if (limit === null) {
            for (let row = 0; row < this.verseIndices.length; row++) {
                if (this.verseIndices[row] === verseIndex) continue;
                const score = dotProductRowRow(this.embeddingsPacked, this.embeddingSize, rowIndex, row);
                if (minScore !== null && score < minScore) continue;
                results.push({ verseIndex: this.verseIndices[row], score });
            }
            return results.sort((a, b) => b.score - a.score);
        }

        const heap = [];
        for (let row = 0; row < this.verseIndices.length; row++) {
            if (this.verseIndices[row] === verseIndex) continue;
            const score = dotProductRowRow(this.embeddingsPacked, this.embeddingSize, rowIndex, row);
            if (minScore !== null && score < minScore) continue;
            if (heap.length < limit) {
                heapPush(heap, { verseIndex: this.verseIndices[row], score });
            } else if (score > heap[0].score) {
                heapReplaceRoot(heap, { verseIndex: this.verseIndices[row], score });
            }
        }

        return heap.sort((a, b) => b.score - a.score);
    }
}

function dotProductQueryRow(queryEmbedding, embeddingsPacked, embeddingSize, rowIndex) {
    const offset = rowIndex * embeddingSize;
    let sum = 0;
    for (let i = 0; i < embeddingSize; i++) {
        sum += queryEmbedding[i] * embeddingsPacked[offset + i];
    }
    return sum;
}

function dotProductRowRow(embeddingsPacked, embeddingSize, rowA, rowB) {
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
