console.log("[ZeroContext] Background service worker active.");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Edge Case: Ignore unmapped actions
    if (message.action !== "REDACT_TEXT") {
        return false;
    }

    if (!message.payload) {
        sendResponse({ status: "ERROR", data: "No payload provided." });
        return false;
    }

    console.log("[ZeroContext] Received payload. Processing...");

    // Simulating the delay of our future ML pipeline
    setTimeout(() => {
        const dummyRedactedText = "[REDACTED BY ZEROCONTEXT]";

        sendResponse({
            status: "SUCCESS",
            data: dummyRedactedText
        });
    }, 50);

    // CRITICAL: Return true to keep the message channel open for the async response
    return true;
});