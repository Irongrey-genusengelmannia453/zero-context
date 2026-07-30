// ─────────────────────────────────────────────────────────────
// Offscreen Bridge — Routes chrome.runtime messages to/from
// the isolated Web Worker. Runs inside the Offscreen Document.
// ─────────────────────────────────────────────────────────────

import type {
    OffscreenRequest,
    WorkerRequest,
    WorkerResponse,
} from './types';

console.log('[ZeroContext] Offscreen bridge initialized.');

// ─── Web Worker instantiation ────────────────────────────────
const aiWorker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

// Pending task callbacks keyed by taskId
const pendingCallbacks = new Map<string, (response: WorkerResponse) => void>();

// ─── Worker response handler ────────────────────────────────
aiWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const callback = pendingCallbacks.get(response.taskId);

    if (callback) {
        pendingCallbacks.delete(response.taskId);
        callback(response);
    } else {
        console.warn(`[ZeroContext] Orphaned worker response for taskId: ${response.taskId}`);
    }
};

// ─── Worker error defense ───────────────────────────────────
aiWorker.onerror = (error: ErrorEvent) => {
    console.error('[ZeroContext] Worker runtime error:', error.message);
    // Reject ALL pending tasks — the worker is in an unknown state
    for (const [taskId, callback] of pendingCallbacks) {
        callback({
            action: 'PING', // Placeholder — callers check status, not action
            taskId,
            status: 'ERROR',
            data: `WORKER_CRASH: ${error.message}`,
        });
    }
    pendingCallbacks.clear();
};

aiWorker.onmessageerror = (event: MessageEvent) => {
    console.error('[ZeroContext] Worker message deserialization error:', event);
};

// ─── Chrome runtime message listener (Background → Offscreen) ──
chrome.runtime.onMessage.addListener(
    (message: OffscreenRequest, _sender, sendResponse) => {
        // Discriminator gate — only process messages targeted at us
        if (message.target !== 'OFFSCREEN') return false;

        const { taskId, workerAction, payload } = message;

        const workerMessage: WorkerRequest = {
            action: workerAction,
            taskId,
            payload,
        };

        // Register callback for when the worker responds
        pendingCallbacks.set(taskId, (workerResponse: WorkerResponse) => {
            // Route response back to Background via sendResponse
            sendResponse({
                target: 'BACKGROUND',
                status: workerResponse.status,
                taskId: workerResponse.taskId,
                data: workerResponse.data,
                durationMs: workerResponse.durationMs,
            });
        });

        // Fire the message to the Worker
        aiWorker.postMessage(workerMessage);

        // CRITICAL: Return true to keep the async sendResponse channel open
        return true;
    },
);
