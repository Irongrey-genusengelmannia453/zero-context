// ─────────────────────────────────────────────────────────────
// Offscreen Bridge — Routes chrome.runtime messages to/from
// the sandboxed AI inference page via postMessage.
//
// Architecture:
//   Background (chrome.runtime) ⇄ Offscreen (iframe postMessage) ⇄ Sandbox (Transformers.js)
//
// The sandbox page has a relaxed CSP that allows the blob: URLs
// which ONNX Runtime requires. The offscreen page has access to
// chrome.* APIs. This bridge connects the two worlds.
// ─────────────────────────────────────────────────────────────

import type {
    OffscreenRequest,
    WorkerResponse,
} from './types';

console.log('[ZeroContext] Offscreen bridge initialized.');

// ─── Sandbox iframe instantiation ───────────────────────────
// The sandbox page is declared in manifest.json under "sandbox".
// We embed it as an invisible iframe and communicate via postMessage.
const sandboxIframe = document.createElement('iframe');
sandboxIframe.src = chrome.runtime.getURL('src/sandbox/sandbox.html');
sandboxIframe.style.display = 'none';
document.body.appendChild(sandboxIframe);

// Pending task callbacks keyed by taskId
const pendingCallbacks = new Map<string, (response: WorkerResponse) => void>();

// ─── Sandbox response handler (via postMessage) ─────────────
window.addEventListener('message', async (event: MessageEvent) => {
    // Only accept messages from our sandbox iframe
    if (event.source !== sandboxIframe.contentWindow) return;

    const data = event.data;

    // Handle cache-delegated fetch requests from the sandbox
    if (data.action === 'FETCH_REQUEST') {
        try {
            const cache = await caches.open('zerocontext-models');
            let response = await cache.match(data.url);
            
            if (!response) {
                console.log(`[ZeroContext] Downloading model file to cache: ${data.url}`);
                response = await fetch(data.url, data.init);
                if (response.ok) {
                    await cache.put(data.url, response.clone());
                }
            } else {
                console.log(`[ZeroContext] Serving model file from cache: ${data.url}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => { headers[key] = value; });
            
            // Transfer the ArrayBuffer with zero-copy overhead
            event.source?.postMessage({
                action: 'FETCH_RESPONSE',
                requestId: data.requestId,
                status: 'SUCCESS',
                buffer: arrayBuffer,
                headers
            }, { targetOrigin: '*', transfer: [arrayBuffer] });
        } catch (err: any) {
            event.source?.postMessage({
                action: 'FETCH_RESPONSE',
                requestId: data.requestId,
                status: 'ERROR',
                error: err.message
            }, '*');
        }
        return;
    }

    // Initialization signal — not tied to a pending task
    if (data.action === 'SANDBOX_READY') {
        console.log(`[ZeroContext] Sandbox ready: ${data.status}`);
        return;
    }

    const response = event.data as WorkerResponse;
    if (!response?.taskId) return;

    const callback = pendingCallbacks.get(response.taskId);
    if (callback) {
        pendingCallbacks.delete(response.taskId);
        callback(response);
    } else {
        console.warn(`[ZeroContext] Orphaned sandbox response for taskId: ${response.taskId}`);
    }
});

// ─── Chrome runtime message listener (Background → Offscreen) ──
chrome.runtime.onMessage.addListener(
    (message: OffscreenRequest, _sender, sendResponse) => {
        // Discriminator gate — only process messages targeted at us
        if (message.target !== 'OFFSCREEN') return false;

        const { taskId, workerAction, payload } = message;

        // Register callback for when the sandbox responds
        pendingCallbacks.set(taskId, (sandboxResponse: WorkerResponse) => {
            // Route response back to Background via sendResponse
            sendResponse({
                target: 'BACKGROUND',
                status: sandboxResponse.status,
                taskId: sandboxResponse.taskId,
                data: sandboxResponse.data,
                durationMs: sandboxResponse.durationMs,
            });
        });

        // Fire the message to the sandbox iframe
        sandboxIframe.contentWindow?.postMessage({
            action: workerAction,
            taskId,
            payload,
        }, '*');

        // CRITICAL: Return true to keep the async sendResponse channel open
        return true;
    },
);
