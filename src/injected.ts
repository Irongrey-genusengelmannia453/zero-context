console.log("[ZeroContext] MAIN world script injected. Monkey-patching clipboard API...");

// Store the original function
const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);

navigator.clipboard.writeText = async (text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        // Generate a unique ID for this specific interception
        const eventId = Math.random().toString(36).substring(2, 15);

        // Define the one-time listener for the response from the ISOLATED world
        const handleResponse = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.eventId === eventId) {
                // Clean up listener
                document.removeEventListener("zerocontext_unredact_response", handleResponse);
                
                // Write the potentially un-redacted text using the original API
                const finalStr = customEvent.detail.text;
                originalWriteText(finalStr).then(resolve).catch(reject);
            }
        };

        document.addEventListener("zerocontext_unredact_response", handleResponse);

        // Dispatch the interception event to the ISOLATED world content script
        const interceptEvent = new CustomEvent("zerocontext_intercept_copy", {
            detail: {
                eventId: eventId,
                text: text
            }
        });
        document.dispatchEvent(interceptEvent);
    });
};
