// Dynamic import to avoid build-time issues
let pipeline, env;

async function loadTransformers() {
    if (!pipeline || !env) {
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
        this.items = [];
        this.embeddingSize = 0;
        this.extractor = null;
    }

    async init() {
        await this._loadEmbeddings();
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
        this.embeddingSize = data.embeddingSize || 0;
        this.items = data.items
            .filter((item) => Array.isArray(item.embedding) && typeof item.verseIndex === 'number')
            .map((item) => ({
                verseIndex: item.verseIndex,
                embedding: Float32Array.from(item.embedding)
            }));
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

    search(queryEmbedding, topK = 25) {
        const results = [];

        for (const item of this.items) {
            const score = dotProduct(queryEmbedding, item.embedding);
            if (results.length < topK) {
                results.push({ verseIndex: item.verseIndex, score });
                if (results.length === topK) {
                    results.sort((a, b) => a.score - b.score);
                }
            } else if (score > results[0].score) {
                results[0] = { verseIndex: item.verseIndex, score };
                results.sort((a, b) => a.score - b.score);
            }
        }

        return results.sort((a, b) => b.score - a.score);
    }

    async searchText(text, topK = 25) {
        const embedding = await this.embedQuery(text);
        return this.search(embedding, topK);
    }
}

function dotProduct(a, b) {
    const len = Math.min(a.length, b.length);
    let sum = 0;
    for (let i = 0; i < len; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}
