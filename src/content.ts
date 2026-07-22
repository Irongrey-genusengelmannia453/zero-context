console.log("[ZeroContext] Content script initialized. Watching for inputs.");

document.addEventListener("paste", async (event: ClipboardEvent) => {
    const activeElement = document.activeElement as HTMLElement;

    // 1. Verify we are pasting into a valid text area
    const isInput = activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT";
    const isContentEditable = activeElement.getAttribute("contenteditable") === "true";

    if (!isInput && !isContentEditable) return;

    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const pastedText = clipboardData.getData("text");
    if (!pastedText.trim()) return;

    // 2. Intercept the default paste behavior
    event.preventDefault();
    console.log("[ZeroContext] Intercepted text. Forwarding to background vault...");

    try {
        // 3. Send to our background script
        const response = await chrome.runtime.sendMessage({
            action: "REDACT_TEXT",
            payload: pastedText
        });

        if (response && response.status === "SUCCESS") {
            // 4. Insert at cursor & preserve Undo stack
            document.execCommand("insertText", false, response.data);
            console.log("[ZeroContext] Successfully injected redacted text.");
        } else {
            console.error("[ZeroContext] Background script failed to process text.");
        }
    } catch (error) {
        console.error("[ZeroContext] Message passing failed.", error);
    }
});

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
document.addEventListener("zerocontext_intercept_copy", async (e: Event) => {
    const customEvent = e as CustomEvent;
    const { eventId, text } = customEvent.detail;

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
    const responseEvent = new CustomEvent("zerocontext_unredact_response", {
        detail: {
            eventId: eventId,
            text: finalStr
        }
    });
    document.dispatchEvent(responseEvent);
}