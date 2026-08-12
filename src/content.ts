import { ZeroContextToast } from './ui/ZeroContextToast';

console.log("[ZeroContext] Content script initialized. Watching for inputs.");

const uiManager = new ZeroContextToast();
let isProcessingText = false;
let isAiDomain = false;

// Check if we are on an AI domain on load
chrome.runtime.sendMessage({ action: "CHECK_AI_DOMAIN", payload: window.location.href }, (response) => {
    if (response && response.isAI) {
        isAiDomain = true;
        console.log("[ZeroContext] Detected AI domain. Redaction enabled for pastes.");
    }
});

window.addEventListener("paste", async (event: ClipboardEvent) => {
    const activeElement = document.activeElement as HTMLElement;

    // 1. Verify we are pasting into a valid text area
    const isInput = activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT";
    const isContentEditable = activeElement.getAttribute("contenteditable") === "true";

    if (!isInput && !isContentEditable) return;

    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const pastedText = clipboardData.getData("text");
    if (!pastedText.trim()) return;

    if (!isAiDomain) {
        // Not an AI domain, do not redact on paste.
        return;
    }

    // 2. Intercept the default paste behavior
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    console.log("[ZeroContext] Intercepted text. Forwarding to background vault...");

    try {
        let isRedacting = true;
        isProcessingText = true;
        
        const toastTimer = setTimeout(() => {
            if (isRedacting && uiManager.state.state !== 'DOWNLOADING_MODEL' && uiManager.state.state !== 'ERROR') {
                uiManager.showIndeterminateRedacting();
            }
        }, 300);

        // Listen for MODEL_ERROR specifically for this paste action
        const errorListener = (msg: any) => {
            if (msg.type === 'MODEL_ERROR') {
                uiManager.showError(msg.message);
            }
        };
        chrome.runtime.onMessage.addListener(errorListener);

        // 3. Send to our background script
        const response = await chrome.runtime.sendMessage({
            action: "REDACT_TEXT",
            payload: pastedText
        });
        
        chrome.runtime.onMessage.removeListener(errorListener);
        isRedacting = false;
        clearTimeout(toastTimer);
        
        if (response && response.error) {
            uiManager.showError(response.error);
        }

        if (response && response.status === "SUCCESS") {
            // 4. Insert at cursor & preserve Undo stack
            const success = document.execCommand("insertText", false, response.data);
            
            // Fallback for expired user gesture (e.g. background ML took > 1s)
            if (!success) {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    const textNode = document.createTextNode(response.data);
                    range.insertNode(textNode);
                    range.setStartAfter(textNode);
                    range.setEndAfter(textNode);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    
                    // Dispatch input event so React/ProseMirror updates its state
                    activeElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                } else if (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT") {
                    const input = activeElement as HTMLInputElement;
                    const start = input.selectionStart || 0;
                    const end = input.selectionEnd || 0;
                    input.value = input.value.substring(0, start) + response.data + input.value.substring(end);
                    input.selectionStart = input.selectionEnd = start + response.data.length;
                    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                }
            }
            console.log("[ZeroContext] Successfully injected redacted text.");
        } else {
            console.error("[ZeroContext] Background script failed to process text.");
        }
    } catch (error) {
        console.error("[ZeroContext] Message passing failed.", error);
    } finally {
        isProcessingText = false;
        uiManager.hide();
    }
}, true);

// Listener for native Ctrl+C or standard DOM copy events
document.addEventListener("copy", (event: ClipboardEvent) => {
    let copiedText = window.getSelection()?.toString() || "";

    if (!copiedText && event.clipboardData) {
        copiedText = event.clipboardData.getData("text/plain");
    }

    if (!copiedText.trim()) return;

    setTimeout(async () => {
        try {
            const response = await chrome.runtime.sendMessage({
                action: "UNREDACT_TEXT",
                payload: copiedText
            });

            if (response && response.status === "SUCCESS") {
                if (response.data !== copiedText) {
                    await navigator.clipboard.writeText(response.data);
                    console.log("[ZeroContext] Clipboard un-redacted successfully (Ctrl+C).");
                }
            }
        } catch (err) {
            console.error("[ZeroContext] Failed to unredact clipboard:", err);
        }
    }, 50); 
});

// Listener for intercepted programmatic clipboard writes from the MAIN world (e.g. Chat UI "Copy" button)
window.addEventListener("message", async (e: MessageEvent) => {
    if (e.source !== window || e.data?.type !== "zerocontext_intercept_copy") return;
    
    const { eventId, text } = e.data;

    if (!text || !text.trim()) {
        dispatchResponse(eventId, text);
        return;
    }

    try {
        const response = await chrome.runtime.sendMessage({
            action: "UNREDACT_TEXT",
            payload: text
        });

        if (response && response.status === "SUCCESS") {
            dispatchResponse(eventId, response.data);
            console.log("[ZeroContext] Programmatic clipboard write un-redacted successfully.");
        } else {
            dispatchResponse(eventId, text); // Fallback to original
        }
    } catch (error) {
        console.error("[ZeroContext] Error processing intercepted copy:", error);
        dispatchResponse(eventId, text); // Fallback to original
    }
});

function dispatchResponse(eventId: string, finalStr: string) {
    window.postMessage({
        type: "zerocontext_unredact_response",
        eventId: eventId,
        text: finalStr
    }, "*");
}

// ─── Global Progress Listeners (from Background) ─────────────
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'MODEL_PROGRESS') {
        const status = msg.status;
        if (status === 'progress' || status === 'downloading' || status === 'initiate') {
            uiManager.updateDownloadProgress(msg.loaded || 0, msg.total || 1);
        } else if (status === 'done' || status === 'ready') {
            // Instead of hiding immediately and causing a flicker before inference starts, 
            // we seamlessly transition back to indeterminate redacting. The final hide() 
            // will be called when the REDACT_TEXT promise resolves.
            if (isProcessingText) {
                uiManager.showIndeterminateRedacting();
            }
        }
    }
});