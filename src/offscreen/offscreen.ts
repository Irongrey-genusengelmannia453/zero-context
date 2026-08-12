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
        const shortUrl = (data.url as string).split('/').slice(-2).join('/');
        console.log(`[ZeroContext:Offscreen] Fetch delegation request: ${shortUrl}`);
        try {
            const cache = await caches.open('zerocontext-models');
            const controller = new AbortController();
            const onOffline = () => {
                console.warn(`[ZeroContext:Offscreen] Network offline detected. Aborting fetch/stream: ${shortUrl}`);
                controller.abort(new Error("NETWORK_OFFLINE"));
            };
            window.addEventListener('offline', onOffline);
            
            let response;
            try {
                if (!navigator.onLine) throw new Error("NETWORK_OFFLINE");
                
                response = await cache.match(data.url);
                if (!response) {
                    console.log(`[ZeroContext:Offscreen] Cache MISS — downloading: ${shortUrl}`);
                    
                    data.init = data.init || {};
                    data.init.signal = controller.signal;
                    response = await fetch(data.url, data.init);
                    
                    if (response.ok) {
                        await cache.put(data.url, response.clone());
                        console.log(`[ZeroContext:Offscreen] Cached: ${shortUrl}`);
                    } else {
                        console.error(`[ZeroContext:Offscreen] Download failed (${response.status}): ${shortUrl}`);
                    }
                } else {
                    console.log(`[ZeroContext:Offscreen] Cache HIT: ${shortUrl}`);
                }
                
                let arrayBuffer: ArrayBuffer;
                if (!response.body) {
                    arrayBuffer = await response.arrayBuffer();
                } else {
                    const reader = response.body.getReader();
                    const chunks: Uint8Array[] = [];
                    let totalLength = 0;
                    let isDone = false;
                    
                    while (!isDone) {
                        const readPromise = reader.read();
                        
                        // Watchdog timer: If 5 seconds pass without a chunk, abort
                        const watchdog = new Promise<never>((_, reject) => {
                            setTimeout(() => reject(new Error("WATCHDOG_TIMEOUT")), 5000);
                        });
                        
                        try {
                            const result = await Promise.race([readPromise, watchdog]);
                            const { done, value } = result as ReadableStreamReadResult<Uint8Array>;
                            isDone = done;
                            if (value) {
                                chunks.push(value);
                                totalLength += value.length;
                            }
                        } catch (err) {
                            reader.cancel().catch(() => {});
                            console.error(`[ZeroContext:Offscreen] Mid-download stream interrupted: ${shortUrl}`, err);
                            throw new Error("FETCH_STREAM_INTERRUPTED");
                        }
                    }
                    
                    // Stitch chunks back together
                    const combined = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of chunks) {
                        combined.set(chunk, offset);
                        offset += chunk.length;
                    }
                    arrayBuffer = combined.buffer;
                }
                
                const headers: Record<string, string> = {};
                response.headers.forEach((value, key) => { headers[key] = value; });
                
                console.log(`[ZeroContext:Offscreen] Sending ${arrayBuffer.byteLength} bytes back to sandbox for: ${shortUrl}`);
                event.source?.postMessage({
                    action: 'FETCH_RESPONSE',
                    requestId: data.requestId,
                    status: 'SUCCESS',
                    buffer: arrayBuffer,
                    headers
                }, { targetOrigin: '*', transfer: [arrayBuffer] });
            } catch (err: unknown) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                console.error(`[ZeroContext:Offscreen] Fetch delegation error: ${errorMsg}`);
                event.source?.postMessage({
                    action: 'FETCH_RESPONSE',
                    requestId: data.requestId,
                    status: 'ERROR',
                    error: errorMsg
                }, '*');
            } finally {
                window.removeEventListener('offline', onOffline);
            }
        } catch (setupErr) {
            console.error(`[ZeroContext:Offscreen] Cache setup error:`, setupErr);
        }
        return;
    }

    // Relay sandbox console logs to the offscreen console (visible to developer)
    if (data.action === 'SANDBOX_LOG') {
        const level = data.level === 'error' ? 'error' : data.level === 'warn' ? 'warn' : 'log';
        console[level](`[ZeroContext:Sandbox→Offscreen] ${data.message}`);
        return;
    }

    // Initialization signal — not tied to a pending task
    if (data.action === 'SANDBOX_READY') {
        console.log(`[ZeroContext] Sandbox ready: ${data.status}`);
        return;
    }

    // Pass-through model download progress to the background
    if (data.action === 'MODEL_PROGRESS') {
        chrome.runtime.sendMessage({
            target: 'BACKGROUND',
            action: 'MODEL_PROGRESS',
            data: data.data,
        }).catch(() => {});
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
    (message: OffscreenRequest, _sender, _sendResponse) => {
        // Discriminator gate — only process messages targeted at us
        if (message.target !== 'OFFSCREEN') return false;

        const { taskId, workerAction, payload } = message;
        console.log(`[ZeroContext:Offscreen] Received task ${taskId} (${workerAction})`);

        // Register callback for when the sandbox responds
        pendingCallbacks.set(taskId, (sandboxResponse: WorkerResponse) => {
            console.log(`[ZeroContext:Offscreen] Sandbox responded for task ${taskId}, routing to background...`);
            // CRITICAL FIX: Use chrome.runtime.sendMessage() to send the response
            // as a NEW message to the background. The background's initOffscreenResponseListener
            // is listening on chrome.runtime.onMessage for messages with target: 'BACKGROUND'.
            // Previously this used sendResponse(), but that sends via the request-reply channel
            // which the background was NOT listening on — causing every response to be lost.
            chrome.runtime.sendMessage({
                target: 'BACKGROUND',
                status: sandboxResponse.status,
                taskId: sandboxResponse.taskId,
                data: sandboxResponse.data,
                durationMs: sandboxResponse.durationMs,
            }).catch((err: unknown) => {
                console.error(`[ZeroContext:Offscreen] Failed to route response to background:`, err);
            });
        });

        // Fire the message to the sandbox iframe
        sandboxIframe.contentWindow?.postMessage({
            action: workerAction,
            taskId,
            payload,
        }, '*');

        // No need to return true since we're not using sendResponse
        return false;
    },
);
