import { VaultManager } from './vault';
import { redactText } from './regexEngine';
import {
    sendWorkerTask,
    closeOffscreenDocument,
    initOffscreenResponseListener,
    getOrCreateOffscreenDocument
} from './offscreen/offscreen-manager';
import { extractTextForML } from './lexer';

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
                
                // Layer 2 & 3: Neural Engine (Run BEFORE regex so it doesn't trip on regex tokens)
                if (isDeepMode) {
                    const stringsToProcess = extractTextForML(redacted);
                    console.log(`[ZeroContext] extractTextForML returned ${stringsToProcess.length} string(s), total length: ${stringsToProcess.reduce((a, s) => a + s.length, 0)}`);
                    
                    if (stringsToProcess.length > 0) {
                        try {
                            const workerStart = performance.now();
                            console.log("[ZeroContext] Sending PROCESS_TEXT to worker...");
                            const response = await sendWorkerTask('PROCESS_TEXT', { texts: stringsToProcess });
                            const workerEnd = performance.now();
                            console.log(`[ZeroContext] Worker responded in ${(workerEnd - workerStart).toFixed(0)}ms, status: ${response.status}, durationMs: ${response.durationMs ?? 'N/A'}`);
                            console.log(`[ZeroContext] response.data type: ${typeof response.data}, isArray: ${Array.isArray(response.data)}`);
                            
                            if (response.status === 'ERROR') {
                                console.error("[ZeroContext] Worker returned ERROR:", response.data);
                            } else {
                                const nerResults = response.data as Array<Array<{ word: string, entity_group?: string, entity?: string, score: number }>>;
                                console.log(`[ZeroContext] NER results outer length: ${nerResults?.length ?? 'null'}`);
                                
                                if (nerResults && nerResults.length > 0) {
                                    for (const entities of nerResults) {
                                        console.log(`[ZeroContext] Processing entity batch: ${entities?.length ?? 'null'} entities`);
                                        if (!entities || !Array.isArray(entities)) {
                                            console.error("[ZeroContext] entities is not an array:", typeof entities, entities);
                                            continue;
                                        }
                                        
                                        let searchIndex = 0;
                                        for (const ent of entities) {
                                            // Filter low confidence and non-entities
                                            if (ent.score > 0.6) {
                                                const type = ent.entity_group || ent.entity?.replace(/^[BI]-/, '') || 'PII';
                                                if (type !== 'O') {
                                                    const cleanWord = ent.word.replace(/^##/, '');
                                                    const token = vaultManager.redactEntity(tabId, type, cleanWord);
                                                    
                                                    const matchIndex = redacted.indexOf(cleanWord, searchIndex);
                                                    if (matchIndex !== -1) {
                                                        redacted = redacted.substring(0, matchIndex) + token + redacted.substring(matchIndex + cleanWord.length);
                                                        searchIndex = matchIndex + token.length;
                                                        console.log(`[ZeroContext] Replaced "${cleanWord}" -> ${token}`);
                                                    } else {
                                                        console.warn(`[ZeroContext] FAILED to find "${cleanWord}" after index ${searchIndex}`);
                                                    }
                                                }
                                            }
                                        }
                                    }
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
                
                const pipelineEnd = performance.now();
                console.log(`[ZeroContext] Total pipeline: ${(pipelineEnd - pipelineStart).toFixed(0)}ms`);
                sendResponse({ status: "SUCCESS", data: redacted });
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