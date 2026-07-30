console.log("[ZeroContext] MAIN world script injected. Monkey-patching clipboard API...");

// Store the original functions
const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
const originalWrite = navigator.clipboard.write?.bind(navigator.clipboard);

// Generic helper to communicate with the isolated world for unredaction
function unredactString(text: string): Promise<string> {
    return new Promise((resolve) => {
        if (!text || !text.trim()) {
            resolve(text);
            return;
        }
        const eventId = Math.random().toString(36).substring(2, 15);
        const handleResponse = (e: MessageEvent) => {
            if (e.source !== window || e.data?.type !== "zerocontext_unredact_response") return;
            if (e.data.eventId === eventId) {
                window.removeEventListener("message", handleResponse);
                resolve(e.data.text);
            }
        };
        window.addEventListener("message", handleResponse);
        window.postMessage({
            type: "zerocontext_intercept_copy",
            eventId: eventId,
            text: text
        }, "*");
    });
}

navigator.clipboard.writeText = async (text: string): Promise<void> => {
    try {
        const finalStr = await unredactString(text);
        return originalWriteText(finalStr);
    } catch (e) {
        return originalWriteText(text);
    }
};

if (originalWrite) {
    navigator.clipboard.write = async (data: ClipboardItem[]): Promise<void> => {
        try {
            if (!data || data.length === 0) return originalWrite(data);
            
            const originalItem = data[0];
            const newTypes: Record<string, Promise<Blob> | Blob> = {};
            let requiresNewItem = false;
            
            for (const type of originalItem.types) {
                if (type === "text/plain" || type === "text/html") {
                    requiresNewItem = true;
                    newTypes[type] = originalItem.getType(type).then(async (blob) => {
                        const text = await blob.text();
                        const unredactedText = await unredactString(text);
                        return new Blob([unredactedText], { type });
                    });
                } else {
                    newTypes[type] = originalItem.getType(type);
                }
            }
            
            if (requiresNewItem) {
                const newItem = new ClipboardItem(newTypes);
                return originalWrite([newItem]);
            }
            return originalWrite(data);
        } catch (e) {
            console.error("[ZeroContext] Error intercepting clipboard.write", e);
            return originalWrite(data);
        }
    };
}
