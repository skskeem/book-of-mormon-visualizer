import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from '@xenova/transformers';
import { parseBookOfMormonText } from '../src/utils/verseParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const sourcePath = path.join(projectRoot, 'public', 'bom.txt');
const outputPath = path.join(projectRoot, 'public', 'embeddings.json');

console.log('Reading source text:', sourcePath);
const rawText = await fs.readFile(sourcePath, 'utf8');
const { verses, verseMeta } = parseBookOfMormonText(rawText, -1);

console.log('Loading embedding model...');
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

const items = [];
let processed = 0;

for (let i = 0; i < verses.length; i++) {
    const meta = verseMeta[i];
    if (!meta || meta.kind !== 'verse') {
        continue;
    }
    const verseText = verses[i];
    if (!verseText) continue;

    const output = await extractor(verseText, { pooling: 'mean', normalize: true });
    items.push({
        verseIndex: i,
        embedding: Array.from(output.data)
    });

    processed++;
    if (processed % 250 === 0) {
        console.log(`Embedded ${processed} verses...`);
    }
}

const embeddingSize = items[0]?.embedding?.length ?? 0;
const payload = {
    model: 'Xenova/all-MiniLM-L6-v2',
    embeddingSize,
    items
};

console.log(`Writing ${items.length} embeddings to ${outputPath}`);
await fs.writeFile(outputPath, JSON.stringify(payload));
console.log('Done.');
