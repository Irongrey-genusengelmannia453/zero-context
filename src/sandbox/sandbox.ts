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

console.log('[ZeroContext] Sandbox initialized.');

// ─── Custom Fetch Interceptor (Cache Delegation) ────────────
// Sandboxed iframes (null origin) cannot access the Cache API.
// To avoid downloading the 20MB model every time, we intercept
// fetch() calls and delegate them to the Offscreen document,
// which has full access to the Chrome extension's CacheStorage.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();
    // Only intercept HuggingFace model downloads
    if (urlStr.includes('huggingface.co')) {
        return new Promise<Response>((resolve, reject) => {
            const requestId = crypto.randomUUID();
            
            const listener = (event: MessageEvent) => {
                if (event.data.action === 'FETCH_RESPONSE' && event.data.requestId === requestId) {
                    window.removeEventListener('message', listener);
                    if (event.data.status === 'SUCCESS') {
                        const response = new Response(event.data.buffer, {
                            status: 200,
                            headers: new Headers(event.data.headers)
                        });
                        // Add url property to response as some code checks it
                        Object.defineProperty(response, 'url', { value: urlStr });
                        resolve(response);
                    } else {
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

// Single-threaded WASM for stability in the sandbox environment
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

// ─── Model Singleton ────────────────────────────────────────
class PipelineSingleton {
    static task = 'token-classification';
    static model = 'Xenova/bert-base-NER';
    static instance: any = null;

    static async getInstance(progress_callback?: Function) {
        if (this.instance === null) {
            this.instance = pipeline(this.task as any, this.model, {
                progress_callback,
                device: 'wasm',
            } as any);
        }
        return this.instance;
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

            default: {
                respond('ERROR', `UNKNOWN_ACTION: "${action}" is not a recognized sandbox action.`);
                break;
            }
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        respond('ERROR', `SANDBOX_ERROR: ${msg}`);
    }
});

// ─── Eager model load ───────────────────────────────────────
PipelineSingleton.getInstance().then(() => {
    console.log('[ZeroContext] WASM NER Model loaded successfully in sandbox.');
    parent.postMessage({ action: 'SANDBOX_READY', status: 'SUCCESS' }, '*');
}).catch((err) => {
    console.error('[ZeroContext] Failed to load WASM NER Model:', err);
    parent.postMessage({ action: 'SANDBOX_READY', status: 'ERROR', data: String(err) }, '*');
});
