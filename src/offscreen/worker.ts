// ─────────────────────────────────────────────────────────────
// Isolated Web Worker — The execution chamber for CPU-heavy
// AI/WASM inference. Runs on a dedicated background thread.
// ─────────────────────────────────────────────────────────────

import type { WorkerRequest, WorkerResponse } from './types';

console.log('[ZeroContext] Worker thread initialized.');

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
