import { VaultManager } from './vault';
import { redactText } from './regexEngine';
import {
    sendWorkerTask,
    closeOffscreenDocument,
    initOffscreenResponseListener,
} from './offscreen/offscreen-manager';

console.log("[ZeroContext] Background service worker active.");

const vaultManager = new VaultManager();

// Initialize the offscreen response listener for Worker round-trips
initOffscreenResponseListener();

// Ephemeral Memory Commitment - Flush tab state when closed
chrome.tabs.onRemoved.addListener((tabId) => {
    vaultManager.clearTab(tabId).catch(err => console.error(err));
});

// Helper to dynamically check if a URL is an AI domain based on manifest and future user settings
async function isAIDomain(targetUrl: string): Promise<boolean> {
    try {
        const urlObj = new URL(targetUrl);
        
        // 1. Get default domains from manifest
        const manifest = chrome.runtime.getManifest();
        const defaultMatches = manifest.content_scripts?.[0]?.matches || [];
        
        // 2. Get future custom domains from storage
        const storage = await chrome.storage.local.get(['customAIDomains']) as { customAIDomains?: string[] };
        const customDomains: string[] = storage.customAIDomains || [];
        
        const allPatterns = [...defaultMatches, ...customDomains];
        
        return allPatterns.some(pattern => {
            // Very basic pattern matching for hostnames
            const cleanHost = pattern.replace(/^(\*|https?):\/\//, '').replace(/\/.*/, '');
            return urlObj.hostname.includes(cleanHost);
        });
    } catch (e) {
        return false;
    }
}

// Ephemeral Memory Commitment - Flush tab state when navigating away from AI domains
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
        const url = changeInfo.url;
        isAIDomain(url).then(isAI => {
            if (!isAI) {
                vaultManager.clearTab(tabId).catch(err => console.error(err));
            }
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ─── Offscreen Worker Pipeline (no tab ID required) ─────
    if (message.action === "WORKER_PING") {
        sendWorkerTask('PING')
            .then(response => sendResponse({ status: "SUCCESS", data: response }))
            .catch(err => sendResponse({ status: "ERROR", data: (err as Error).message }));
        return true;
    }

    if (message.action === "WORKER_HEAVY_WORKLOAD") {
        sendWorkerTask('SIMULATE_HEAVY_WORKLOAD', message.payload)
            .then(response => sendResponse({ status: "SUCCESS", data: response }))
            .catch(err => sendResponse({ status: "ERROR", data: (err as Error).message }));
        return true;
    }

    if (message.action === "CLOSE_OFFSCREEN") {
        closeOffscreenDocument()
            .then(() => sendResponse({ status: "SUCCESS", data: "Offscreen document closed." }))
            .catch(err => sendResponse({ status: "ERROR", data: (err as Error).message }));
        return true;
    }

    // ─── PII Redaction Pipeline (requires tab ID) ───────────
    const tabId = sender.tab?.id;
    if (!tabId) {
        sendResponse({ status: "ERROR", data: "No tab ID found." });
        return false;
    }

    if (!message.payload && message.payload !== "") {
        sendResponse({ status: "ERROR", data: "No payload provided." });
        return false;
    }

    // Gatekeeper Promise - ensure synchronous memory cache is loaded
    (async () => {
        try {
            await vaultManager.ensureHydrated();

            if (message.action === "REDACT_TEXT") {
                console.log("[ZeroContext] Redacting payload...");
                const redacted = redactText(tabId, message.payload, vaultManager);
                sendResponse({ status: "SUCCESS", data: redacted });
            } 
            else if (message.action === "UNREDACT_TEXT") {
                console.log("[ZeroContext] Un-redacting payload...");
                const restored = vaultManager.unredactText(tabId, message.payload);
                sendResponse({ status: "SUCCESS", data: restored });
            } 
            else {
                sendResponse({ status: "ERROR", data: "Unknown action." });
            }
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error("[ZeroContext] Error processing message:", error);
            sendResponse({ status: "ERROR", data: errMsg });
        }
    })();

    // CRITICAL: Return true to keep the message channel open for the async response
    return true;
});