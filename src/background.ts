import { VaultManager } from './vault';
import { DomainGatekeeper } from './domainGatekeeper';
import { redactText } from './regexEngine';
import {
    sendWorkerTask,
    closeOffscreenDocument,
    initOffscreenResponseListener
} from './offscreen/offscreen-manager';
import { extractTextForML } from './lexer';
import { processNerResults } from './nerProcessor';
import type { NerResultSet } from './types/ner';

console.log("[ZeroContext] Background service worker active.");

const vaultManager = new VaultManager();

// Initialize the offscreen response listener for Worker round-trips
initOffscreenResponseListener();

const tabOfflineErrorShown = new Set<number>();

// Ephemeral Memory Commitment - Flush tab state when closed
chrome.tabs.onRemoved.addListener((tabId) => {
    vaultManager.clearTab(tabId).catch(err => console.error(err));
    tabOfflineErrorShown.delete(tabId);
});

// ─── Smart Lifecycle Management ─────────────────────────────
const IDLE_TEARDOWN_MINUTES = 5; // 5 minutes to prevent aggressive unloads

function handleTabSwitch(url?: string) {
    if (!url) {
        startTeardownTimer();
        return;
    }

    isAIDomain(url).then(isAI => {
        if (isAI) {
            chrome.alarms.clear('TEARDOWN_MODEL').catch(() => { });

            chrome.offscreen.hasDocument().then(hasDoc => {
                if (!hasDoc) {
                    sendWorkerTask('PREWARM_MODEL').catch(err => console.error('[ZeroContext] Prewarm failed:', err));
                }
            });
        } else {
            startTeardownTimer();
        }
    });
}

function startTeardownTimer() {
    chrome.alarms.create('TEARDOWN_MODEL', { delayInMinutes: IDLE_TEARDOWN_MINUTES });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'TEARDOWN_MODEL') {
        try {
            const hasDoc = await chrome.offscreen.hasDocument();
            if (hasDoc) {
                await closeOffscreenDocument();
            }
        } catch (e) {
            // Gracefully swallow error
        }
    }
});

// Track tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        handleTabSwitch(tab.url);
    } catch (e) {
        handleTabSwitch(undefined);
    }
});

// ─── Onboarding Flow ────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    }
});

// Helper to dynamically check if a URL is an AI domain based on manifest and future user settings
async function isAIDomain(targetUrl: string): Promise<boolean> {
    try {
        const gatekeeper = new DomainGatekeeper();
        await gatekeeper.initialize();
        return gatekeeper.isUrlAllowed(targetUrl);
    } catch (e) {
        return false;
    }
}

// Ephemeral Memory Commitment - Flush tab state when navigating away from AI domains
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        tabOfflineErrorShown.delete(tabId);
    }

    if (changeInfo.url) {
        const url = changeInfo.url;
        isAIDomain(url).then(isAI => {
            if (!isAI) {
                vaultManager.clearTab(tabId).catch(err => console.error(err));
            }
        });
    }

    if (tab.active) {
        handleTabSwitch(tab.url);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ─── Global Progress Broadcast ──────────────────────────
    if (message.action === "MODEL_PROGRESS") {
        chrome.tabs.query({}).then(tabs => {
            for (const t of tabs) {
                if (t.id) {
                    chrome.tabs.sendMessage(t.id, {
                        type: 'MODEL_PROGRESS',
                        ...message.data
                    }).catch(() => { });
                }
            }
        });
        return false;
    }

    // ─── Live Debugging Relay ───────────────────────────────
    if (message.action === "DEBUG_LOG") {
        console.log(`[Relay] ${message.data}`);
        sendResponse({ status: "SUCCESS" });
        return true;
    }

    // ─── Offscreen Worker Pipeline (no tab ID required) ─────
    if (message.action === "PREWARM_MODEL") {
        sendWorkerTask('PREWARM_MODEL')
            .then(response => sendResponse({ status: "SUCCESS", data: response }))
            .catch(err => sendResponse({ status: "ERROR", data: (err as Error).message }));
        return true;
    }

    if (message.action === "WORKER_PING") {
        sendWorkerTask('PING')
            .then(response => sendResponse({ status: "SUCCESS", data: response }))
            .catch(err => sendResponse({ status: "ERROR", data: (err as Error).message }));
        return true;
    }

    if (message.action === "CHECK_AI_DOMAIN") {
        isAIDomain(message.payload).then(isAI => {
            sendResponse({ isAI });
        });
        return true;
    }

    if (message.action === "REQUEST_VAULT_SYNC") {
        const tabId = sender.tab?.id;
        if (tabId) {
            vaultManager.ensureHydrated().then(() => {
                const reverseMap = vaultManager.getReverseMap(tabId);
                if (Object.keys(reverseMap).length > 0) {
                    chrome.tabs.sendMessage(tabId, {
                        action: "VAULT_SYNC",
                        reverseMap
                    }).catch(() => {});
                }
            });
        }
        sendResponse({ status: "OK" });
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
                const pipelineStart = performance.now();
                console.log("[ZeroContext] Redacting payload...");
                const storage = await chrome.storage.local.get(['engineMode', 'isRedactionEnabled']);
                if (storage.isRedactionEnabled === false) {
                    sendResponse({ status: "SUCCESS", data: message.payload });
                    return;
                }

                let redacted = message.payload;
                const isDeepMode = storage.engineMode === 'deep' || storage.engineMode === undefined;
                console.log(`[ZeroContext] Engine mode: ${storage.engineMode ?? 'deep (default)'}, isDeepMode: ${isDeepMode}`);
                let pipelineError: string | undefined = undefined;

                let temporaryRegexMode = false;
                try {
                    const sessionState = await chrome.storage.session.get('temporaryRegexMode');
                    temporaryRegexMode = !!sessionState.temporaryRegexMode;
                } catch (e) {
                    // Ignored
                }

                // Auto-Recovery Network Ping
                if (isDeepMode && temporaryRegexMode) {
                    if (navigator.onLine) {
                        try {
                            console.log("[ZeroContext] Auto-Recovery: Network appears online. Pinging...");
                            // Lightweight ping to check real connectivity (2s timeout)
                            const controller = new AbortController();
                            const timeout = setTimeout(() => controller.abort(), 2000);
                            // Use mode: 'no-cors' to avoid CORS blocking. Any resolution (opaque response) is a success.
                            await fetch('https://huggingface.co/', { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: controller.signal });
                            clearTimeout(timeout);

                            console.log("[ZeroContext] Auto-Recovery: Ping successful. Re-enabling Deep Mode.");
                            await chrome.storage.session.remove('temporaryRegexMode');
                            temporaryRegexMode = false;
                        } catch (pingErr) {
                            console.log("[ZeroContext] Auto-Recovery: Ping failed. Staying in normal mode.");
                        }
                    }
                }

                // Layer 2 & 3: Neural Engine (Run BEFORE regex so it doesn't trip on regex tokens)
                if (isDeepMode && !temporaryRegexMode) {
                    const stringsToProcess = extractTextForML(redacted);
                    console.log(`[ZeroContext] extractTextForML returned ${stringsToProcess.length} string(s), total length: ${stringsToProcess.reduce((a, s) => a + s.length, 0)}`);

                    if (stringsToProcess.length > 0) {
                        try {
                            const workerStart = performance.now();
                            console.log("[ZeroContext] Sending PROCESS_TEXT to worker in chunks...");
                            const allNerResults: NerResultSet = [];
                            let mlFailed = false;

                            for (let i = 0; i < stringsToProcess.length; i++) {
                                try {
                                    const response = await sendWorkerTask('PROCESS_TEXT', { texts: [stringsToProcess[i]] });

                                    if (response.status === 'ERROR') {
                                        console.error("[ZeroContext] Worker returned ERROR:", response.data);
                                        mlFailed = true;

                                        const errorData = String(response.data);
                                        if (errorData.includes('FETCH_STREAM_INTERRUPTED')) {
                                            pipelineError = "Network interrupted during AI download. Falling back to normal mode.";
                                        } else if (errorData.includes('Failed to fetch') || errorData.includes('NetworkError')) {
                                            pipelineError = "Model needs to be downloaded but internet connection is not available. Switching to normal mode.";
                                        } else {
                                            pipelineError = `AI Initialization Error: ${errorData}. Switching to normal mode.`;
                                        }
                                        break;
                                    } else {
                                        const nerResults = response.data as NerResultSet;
                                        if (nerResults && nerResults.length > 0) {
                                            allNerResults.push(...nerResults);
                                        }
                                    }
                                } catch (taskErr) {
                                    console.error("[ZeroContext] Worker task failed unexpectedly:", taskErr);
                                    mlFailed = true;
                                    pipelineError = "Network interrupted during AI download. Falling back to normal mode.";
                                    break;
                                }
                            }

                            if (mlFailed) {
                                if (!tabOfflineErrorShown.has(tabId)) {
                                    tabOfflineErrorShown.add(tabId);
                                } else {
                                    pipelineError = undefined;
                                }
                                await chrome.storage.session.set({ temporaryRegexMode: true });
                            } else {
                                const workerEnd = performance.now();
                                console.log(`[ZeroContext] Worker chunks completed in ${(workerEnd - workerStart).toFixed(0)}ms`);

                                if (allNerResults.length > 0) {
                                    redacted = processNerResults(redacted, allNerResults, tabId, vaultManager);
                                } else {
                                    console.warn("[ZeroContext] NER results empty or null");
                                }
                            }
                        } catch (err) {
                            console.error("[ZeroContext] NER Error (full):", err);
                            console.error("[ZeroContext] NER Error message:", err instanceof Error ? err.message : String(err));
                            console.error("[ZeroContext] NER Error stack:", err instanceof Error ? err.stack : 'no stack');
                        }
                    }
                }

                // Layer 1: Deterministic Redaction (Regex engine cleans up anything ML missed like cards/emails)
                redacted = redactText(tabId, redacted, vaultManager);

                // Sync vault state to content script for synchronous un-redaction on copy
                chrome.tabs.sendMessage(tabId, {
                    action: "VAULT_SYNC",
                    reverseMap: vaultManager.getReverseMap(tabId)
                }).catch(() => {});

                const pipelineEnd = performance.now();
                console.log(`[ZeroContext] Total pipeline: ${(pipelineEnd - pipelineStart).toFixed(0)}ms`);

                sendResponse({ status: "SUCCESS", data: redacted, error: pipelineError });
            }
            else if (message.action === "UNREDACT_TEXT") {
                console.log("[ZeroContext] Un-redacting payload...");
                const storage = await chrome.storage.local.get(['isRedactionEnabled']);
                if (storage.isRedactionEnabled === false) {
                    sendResponse({ status: "SUCCESS", data: message.payload });
                    return;
                }
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