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
        // 3. Send to our background script (which takes ~100ms)
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