// ─────────────────────────────────────────────────────────────
// Isolated Web Worker — The execution chamber for CPU-heavy
// AI/WASM inference. Runs on a dedicated background thread.
// ─────────────────────────────────────────────────────────────

import type { WorkerRequest, WorkerResponse } from './types';
import { pipeline, env } from '@huggingface/transformers';

console.log('[ZeroContext] Worker thread initialized.');

// Configure environment to fetch models from HuggingFace and cache in browser
env.allowLocalModels = false;
env.useBrowserCache = true;

// CRITICAL for Manifest V3: 
// The WebGPU backend in ONNX Runtime uses Emscripten pthreads, which spawn Web Workers
// from blob: URLs. Chrome's MV3 CSP blocks ALL blob: script execution, making WebGPU
// fundamentally incompatible. We use the WASM backend instead, which is fully supported
// via the 'wasm-unsafe-eval' CSP directive already in our manifest.
//
// We also disable multithreading (numThreads=1) because multi-threaded WASM also uses
// blob: URLs for its pthread workers. Single-threaded WASM avoids this entirely.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

// Singleton pattern to load the NER model
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

// Eagerly load the model on worker initialization
PipelineSingleton.getInstance().then(() => {
    console.log('[ZeroContext] WASM NER Model loaded successfully.');
}).catch((err) => {
    console.error('[ZeroContext] Failed to load WASM NER Model:', err);
});

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    const { action, taskId, payload } = event.data;

    switch (action) {
        case 'PING': {
            const response: WorkerResponse = {
                action,
                taskId,
                status: 'SUCCESS',
                data: {
                    pong: true,
                    timestamp: Date.now(),
                    thread: 'web-worker',
                },
            };
            self.postMessage(response);
            break;
        }

        case 'SIMULATE_HEAVY_WORKLOAD': {
            const start = performance.now();

            // Deterministic CPU-bound sync loop (~3 seconds)
            // Uses repeated trigonometric calculations to prevent JIT optimization
            const durationTarget = (payload as { durationMs?: number })?.durationMs ?? 3000;
            let accumulator = 0;
            while (performance.now() - start < durationTarget) {
                for (let i = 0; i < 10_000; i++) {
                    accumulator += Math.sin(accumulator + i) * Math.cos(accumulator - i);
                }
            }

            const elapsed = Math.round(performance.now() - start);

            const response: WorkerResponse = {
                action,
                taskId,
                status: 'SUCCESS',
                data: {
                    completed: true,
                    iterations: 'variable',
                    accumulator: accumulator,
                },
                durationMs: elapsed,
            };
            self.postMessage(response);
            break;
        }

        default: {
            const response: WorkerResponse = {
                action,
                taskId,
                status: 'ERROR',
                data: `UNKNOWN_ACTION: "${action}" is not a recognized worker action.`,
            };
            self.postMessage(response);
            break;
        }
    }
});
