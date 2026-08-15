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

// Helper to relay logs to the Background Service Worker console for live debugging
function logToBackground(message: string) {
    console.log(`[ZeroContext:Offscreen] ${message}`);
    chrome.runtime.sendMessage({
        target: 'BACKGROUND',
        action: 'DEBUG_LOG',
        data: `[Offscreen] ${message}`
    }).catch(() => {});
}

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
            // Reverted to original cache name to prevent stranding dead data
            const cache = await caches.open('zerocontext-models');
            const controller = new AbortController();
            const onOffline = () => {
                console.warn(`[ZeroContext:Offscreen] Network offline detected. Aborting fetch/stream: ${shortUrl}`);
                controller.abort(new Error("NETWORK_OFFLINE"));
            };
            window.addEventListener('offline', onOffline);
            
            let response;
            let isCachedHit = false;
            try {
                response = await cache.match(data.url, { ignoreSearch: true, ignoreVary: true });
                
                // If the cache returns a 1-byte file (from the previous Range request bug),
                // it is corrupted. We evict it dynamically instead of stranding dead bytes on disk.
                if (response) {
                    const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
                    if (contentLength <= 1) {
                        await cache.delete(data.url, { ignoreSearch: true, ignoreVary: true });
                        response = undefined; // Force a MISS
                    }
                }

                if (!response) {
                    if (!navigator.onLine) throw new Error("NETWORK_OFFLINE");
                    
                    data.init = data.init || {};
                    data.init.signal = controller.signal;
                    response = await fetch(data.url, data.init);
                    
                    if (!response.ok) {
                        console.error(`[ZeroContext:Offscreen] Download failed (${response.status}): ${shortUrl}`);
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    // We DO NOT cache here. We cache the fully stitched ArrayBuffer below.
                } else {
                    isCachedHit = true;
                }
                
                // Native arrayBuffer() is vastly more efficient than manual JS chunking
                const arrayBuffer = await response.arrayBuffer();

                // If this was a network hit AND a full 200 OK response, cache it.
                // Do NOT cache 206 Partial Content or errors.
                if (!isCachedHit && response.status === 200) {
                    const cacheBuffer = arrayBuffer.slice(0);
                    
                    // Reconstruct the response with generic headers to strip Hugging Face's expiring CDN headers
                    const cacheResponse = new Response(cacheBuffer, {
                        status: 200,
                        headers: {
                            'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
                            'Content-Length': String(cacheBuffer.byteLength),
                        }
                    });

                    await cache.put(data.url, cacheResponse);
                }
                
                const headers: Record<string, string> = {};
                response.headers.forEach((value, key) => { headers[key] = value; });
                
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
        logToBackground(`[Sandbox] ${data.message}`);
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
            // Use chrome.runtime.sendMessage() to send the response as a NEW message to the background.
            // The background's initOffscreenResponseListener is listening on chrome.runtime.onMessage
            // for messages with target: 'BACKGROUND'.
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
