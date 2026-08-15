import { ZeroContextToast } from './ui/ZeroContextToast';
import type { ExtensionBroadcastMessage } from './types/progress';

console.log("[ZeroContext] Content script initialized. Watching for inputs.");

const uiManager = new ZeroContextToast();
let isProcessingText = false;
let isAiDomain = false;
let localVaultCache: Record<string, string> = {};
let isPillar2Writing = false; // Guard to prevent Pillar 1 from re-processing our writes

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
        const errorListener = (msg: ExtensionBroadcastMessage) => {
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

// ─── Request VAULT_SYNC on load to survive page refreshes ────
// If the user refreshes the tab, localVaultCache is wiped. Ask background
// for the current reverse map so previously-redacted text can still be unredacted.
chrome.runtime.sendMessage({ action: "REQUEST_VAULT_SYNC" }).catch(() => {});

/**
 * Unredacts a string using the provided cache.
 * Sorts tokens by length descending to prevent partial replacements.
 */
function unredactString(text: string, cache: Record<string, string>): { result: string, mutated: boolean } {
    const tokens = Object.keys(cache).sort((a, b) => b.length - a.length);
    let result = text;
    let mutated = false;
    
    for (const token of tokens) {
        if (result.includes(token)) {
            result = result.replaceAll(token, cache[token]);
            mutated = true;
        }
    }
    
    return { result, mutated };
}

// Intercept native DOM copy events (Ctrl+C / Cmd+C)
// Preserves rich-text formatting (text/html) by traversing and mutating TextNodes safely.
// We use the capture phase (true) so we intercept the event BEFORE React/ChatGPT can.
document.addEventListener("copy", (event: ClipboardEvent) => {
    // Skip if this copy event was triggered by Pillar 2's execCommand write
    if (isPillar2Writing) return;
    
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    if (Object.keys(localVaultCache).length === 0) {
        return;
    }

    const range = sel.getRangeAt(0);
    const tempDiv = document.createElement("div");
    tempDiv.appendChild(range.cloneContents());

    const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;

    let wasMutated = false;
    while ((node = walker.nextNode())) {
        if (node.nodeValue) {
            const { result, mutated } = unredactString(node.nodeValue, localVaultCache);
            if (mutated) {
                node.nodeValue = result;
                wasMutated = true;
            }
        }
    }

    if (wasMutated) {
        event.preventDefault();
        event.stopImmediatePropagation(); // Prevent React/ChatGPT from overriding this copy
        
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        document.body.appendChild(tempDiv);
        const unredactedText = tempDiv.innerText || tempDiv.textContent || "";
        document.body.removeChild(tempDiv);

        event.clipboardData?.setData("text/plain", unredactedText);
        event.clipboardData?.setData("text/html", tempDiv.innerHTML);
    }
}, true); // <--- Capture phase intercepts before bubbling phase listeners

// ─── Pillar 2: Programmatic Copy Interception ────────────────
// The MAIN world script (programmatic_copy_override.ts) dispatches
// 'ZeroContext_Programmatic_Copy_Req' and suppresses the page's write.
// This ISOLATED world listener performs the actual clipboard write.
// We use document.execCommand('copy') because the clipboardWrite permission
// bypasses user gesture requirements for execCommand, but NOT for the Async
// Clipboard API (navigator.clipboard.writeText).

/**
 * Writes text to clipboard using the execCommand approach.
 * Works with the clipboardWrite permission without a user gesture.
 */
function writeClipboardViaExecCommand(text: string): void {
    isPillar2Writing = true;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    // Reset guard after a microtask so the synchronous copy event from execCommand has fired.
    Promise.resolve().then(() => { isPillar2Writing = false; });
}

window.addEventListener('ZeroContext_Programmatic_Copy_Req', (e: Event) => {
    const customEvent = e as CustomEvent<string>;
    const text = customEvent.detail;

    if (!text || !text.trim() || Object.keys(localVaultCache).length === 0) {
        writeClipboardViaExecCommand(text ?? "");
        return;
    }

    const { result: unredactedData, mutated } = unredactString(text, localVaultCache);
    writeClipboardViaExecCommand(unredactedData);
    
    if (mutated) {
        console.debug("[ZeroContext] Programmatic copy unredacted successfully.");
    }
});

// ─── Global Progress Listeners (from Background) ─────────────
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'VAULT_SYNC' && msg.reverseMap) {
        localVaultCache = msg.reverseMap;
        console.debug(`[ZeroContext] Vault synced. Cache size: ${Object.keys(localVaultCache).length}`);
        return;
    }

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
            } else {
                uiManager.hide();
            }
        }
    }
});