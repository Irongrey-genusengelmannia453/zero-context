// Injected into the MAIN world to intercept programmatic clipboard writes.
// This script ONLY dispatches an event and suppresses the original write.
// The ISOLATED world (content.ts) performs the actual clipboard write.

Clipboard.prototype.writeText = function(text: string): Promise<void> {
    window.dispatchEvent(new CustomEvent('ZeroContext_Programmatic_Copy_Req', { detail: text }));
    return Promise.resolve();
};

// Hook clipboard.write() — Rich-text editors and AI clients often use ClipboardItems.
const originalWrite = Clipboard.prototype.write;
Clipboard.prototype.write = function(data: ClipboardItem[]): Promise<void> {
    // Extract text/plain from the first ClipboardItem if available.
    // ClipboardItem.getType() is async, but we dispatch to the ISOLATED world.
    const item = data[0];
    if (item && item.types.includes('text/plain')) {
        item.getType('text/plain')
            .then(blob => blob.text())
            .then(text => {
                window.dispatchEvent(new CustomEvent('ZeroContext_Programmatic_Copy_Req', { detail: text }));
            });
        return Promise.resolve();
    }
    // Fallback: no text/plain found, let the original write() proceed.
    return originalWrite.call(this, data);
};
