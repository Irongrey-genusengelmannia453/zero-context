// ─────────────────────────────────────────────────────────────
// AI Sandbox — Runs inside a Chrome MV3 sandboxed page.
//
// WHY: ONNX Runtime Web (used by @huggingface/transformers)
// creates blob: URLs internally for Emscripten pthread workers
// and dynamic module imports. Chrome MV3's strict CSP blocks
// ALL blob: script execution on extension_pages. Sandboxed pages
// have a relaxed CSP that allows 'unsafe-eval' and blob: URLs.
//
// The trade-off: sandboxed pages cannot access chrome.* APIs.
// Communication with the extension happens via window.postMessage.
// ─────────────────────────────────────────────────────────────

import { pipeline, env } from '@huggingface/transformers';

// ─── Relay Logger ───────────────────────────────────────────
// Sandbox console is invisible to the user. Relay critical logs
// to the parent (Offscreen) so they appear in a visible console.
function relayLog(level: 'log' | 'error' | 'warn', ...args: unknown[]) {
    const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    console[level](`[ZeroContext:Sandbox] ${message}`);
    parent.postMessage({ action: 'SANDBOX_LOG', level, message: `[Sandbox] ${message}` }, '*');
}

relayLog('log', 'Sandbox initialized.');

// ─── Custom Fetch Interceptor (Cache Delegation) ────────────
// Sandboxed iframes (null origin) cannot access the Cache API.
// To avoid downloading the 20MB model every time, we intercept
// fetch() calls and delegate them to the Offscreen document,
// which has full access to the Chrome extension's CacheStorage.
const FETCH_DELEGATION_TIMEOUT = 120_000; // 120s — model files can be large
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();
    // Only intercept HuggingFace model downloads
    if (urlStr.includes('huggingface.co')) {
        const shortUrl = urlStr.split('/').slice(-2).join('/');
        relayLog('log', `Fetch intercepted: ${shortUrl}`);

        return new Promise<Response>((resolve, reject) => {
            const requestId = crypto.randomUUID();

            // CRITICAL FIX: Add timeout so a lost postMessage doesn't hang forever
            const timeout = setTimeout(() => {
                window.removeEventListener('message', listener);
                reject(new Error(`FETCH_DELEGATION_TIMEOUT: ${shortUrl} did not respond within ${FETCH_DELEGATION_TIMEOUT}ms`));
            }, FETCH_DELEGATION_TIMEOUT);

            const listener = (event: MessageEvent) => {
                if (event.data.action === 'FETCH_RESPONSE' && event.data.requestId === requestId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', listener);
                    if (event.data.status === 'SUCCESS') {
                        relayLog('log', `Fetch complete: ${shortUrl} (${(event.data.buffer?.byteLength ?? 0)} bytes)`);
                        const response = new Response(event.data.buffer, {
                            status: 200,
                            headers: new Headers(event.data.headers)
                        });
                        // Add url property to response as some code checks it
                        Object.defineProperty(response, 'url', { value: urlStr });
                        resolve(response);
                    } else {
                        relayLog('error', `Fetch failed: ${shortUrl} — ${event.data.error}`);
                        reject(new Error(event.data.error));
                    }
                }
            };
            window.addEventListener('message', listener);

            parent.postMessage({
                action: 'FETCH_REQUEST',
                requestId,
                url: urlStr,
                init
            }, '*');
        });
    }
    return originalFetch(input, init);
};

// Configure environment
env.allowLocalModels = false;
env.useBrowserCache = false; // Disabled locally; caching is delegated to Offscreen via fetch override

// CRITICAL FIX: Force WASM-only execution. Disable WebGPU probing entirely.
// Transformers.js v3 probes for WebGPU even when device='wasm', causing
// requestAdapter() calls that can crash or hang in sandboxed iframes.
if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.proxy = false;
}

// ─── Model Singleton ────────────────────────────────────────
// CRITICAL FIX: Store the PROMISE, not the result. This prevents
// the race condition where the eager load and PROCESS_TEXT handler
// both see `instance === null` and double-load the model.
class PipelineSingleton {
    static task = 'token-classification';
    static model = 'Xenova/distilbert-base-multilingual-cased-ner-hrl';
    static instancePromise: Promise<unknown> | null = null;

    static getInstance(progress_callback?: NonNullable<Parameters<typeof pipeline>[2]>['progress_callback']): Promise<unknown> {
        if (this.instancePromise === null) {
            relayLog('log', `Loading model: ${this.model}...`);
            this.instancePromise = pipeline(this.task as "token-classification", this.model, {
                progress_callback,
                device: 'wasm',
                quantized: true,
            } as Parameters<typeof pipeline>[2]).then(instance => {
                relayLog('log', 'Model loaded successfully.');
                return instance;
            }).catch(err => {
                // Reset so future calls can retry
                this.instancePromise = null;
                throw err;
            });
        }
        return this.instancePromise;
    }
}

// ─── Message handler (Offscreen → Sandbox) ──────────────────
window.addEventListener('message', async (event: MessageEvent) => {
    const { action, taskId, payload } = event.data;
    if (!action || !taskId) return; // Ignore non-ZeroContext messages

    const respond = (status: 'SUCCESS' | 'ERROR', data: unknown, durationMs?: number) => {
        parent.postMessage({ action, taskId, status, data, durationMs }, '*');
    };

    try {
        switch (action) {
            case 'PING': {
                respond('SUCCESS', {
                    pong: true,
                    timestamp: Date.now(),
                    thread: 'sandbox',
                });
                break;
            }

            case 'SIMULATE_HEAVY_WORKLOAD': {
                const start = performance.now();
                const durationTarget = (payload as { durationMs?: number })?.durationMs ?? 3000;
                let accumulator = 0;
                while (performance.now() - start < durationTarget) {
                    for (let i = 0; i < 10_000; i++) {
                        accumulator += Math.sin(accumulator + i) * Math.cos(accumulator - i);
                    }
                }
                const elapsed = Math.round(performance.now() - start);

                respond('SUCCESS', {
                    completed: true,
                    iterations: 'variable',
                    accumulator,
                }, elapsed);
                break;
            }

            case 'PROCESS_TEXT': {
                const texts = (payload as { texts?: string[] })?.texts ?? [];
                relayLog('log', `PROCESS_TEXT received. ${texts.length} text(s) to process.`);

                const loadStart = performance.now();
                const model = await PipelineSingleton.getInstance() as Function;
                const loadEnd = performance.now();
                relayLog('log', `Model getInstance: ${(loadEnd - loadStart).toFixed(0)}ms`);

                const results: Array<Array<{ word: string; entity_group: string; score: number; start: number; end: number }>> = [];

                for (const text of texts) {
                    relayLog('log', `Running inference on text (${text.length} chars)...`);
                    const inferStart = performance.now();
                    const output = await model(text, { aggregation_strategy: 'simple' });
                    const inferEnd = performance.now();
                    relayLog('log', `Inference done: ${(inferEnd - inferStart).toFixed(0)}ms`);

                    // CRITICAL: Transformers.js returns a custom TokenClassificationOutput class,
                    // NOT a plain Array. postMessage uses the structured clone algorithm which may
                    // silently drop properties from custom classes. We must explicitly convert to
                    // plain JSON-safe objects before sending through postMessage.
                    const plainEntities: Array<{ word: string; entity_group: string; score: number; start: number; end: number }> = [];
                    for (const entity of output) {
                        plainEntities.push({
                            word: String(entity.word ?? ''),
                            entity_group: String(entity.entity_group ?? entity.entity ?? 'O'),
                            score: Number(entity.score ?? 0),
                            start: Number(entity.start ?? 0),
                            end: Number(entity.end ?? 0),
                        });
                    }
                    relayLog('log', `Found ${plainEntities.length} entities: ${plainEntities.map(e => `[${e.entity_group}] "${e.word}"`).join(', ')}`);
                    results.push(plainEntities);
                }

                const totalMs = Math.round(performance.now() - loadStart);
                respond('SUCCESS', results, totalMs);
                break;
            }

            default: {
                respond('ERROR', `UNKNOWN_ACTION: "${action}" is not a recognized sandbox action.`);
                break;
            }
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        relayLog('error', `Handler error: ${msg}`);
        respond('ERROR', `SANDBOX_ERROR: ${msg}`);
    }
});

// ─── Eager model load ───────────────────────────────────────
PipelineSingleton.getInstance().then(() => {
    relayLog('log', 'Eager model load complete.');
    parent.postMessage({ action: 'SANDBOX_READY', status: 'SUCCESS' }, '*');
}).catch((err) => {
    relayLog('error', `Eager model load failed: ${err}`);
    parent.postMessage({ action: 'SANDBOX_READY', status: 'ERROR', data: String(err) }, '*');
});
