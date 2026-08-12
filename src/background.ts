import { VaultManager } from './vault';
import { redactText, replaceOutsideTokens } from './regexEngine';
import {
    sendWorkerTask,
    closeOffscreenDocument,
    initOffscreenResponseListener
} from './offscreen/offscreen-manager';
import { extractTextForML } from './lexer';
import { mapMLTagToSemantic } from './semanticMapper';

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
                                const nerResults = response.data as Array<Array<{ word: string, entity_group?: string, entity?: string, score: number, start: number, end: number }>>;
                                console.log(`[ZeroContext] NER results outer length: ${nerResults?.length ?? 'null'}`);
                                
                                if (nerResults && nerResults.length > 0) {
                                    const canonicalEntities = new Map<string, string>(); // canonicalText -> semanticType

                                    // 1. Gather all high-confidence ML entities
                                    for (const entities of nerResults) {
                                        if (!entities || !Array.isArray(entities)) continue;
                                        
                                        for (const ent of entities) {
                                            if (ent.score > 0.6) {
                                                const rawType = ent.entity_group || ent.entity?.replace(/^[BI]-/, '') || 'PII';
                                                const semanticType = mapMLTagToSemantic(rawType);
                                                if (semanticType !== null) {
                                                    const cleanWord = ent.word.replace(/^##/, '');
                                                    // This naturally deduplicates. Longest canonicals will be sorted next.
                                                    canonicalEntities.set(cleanWord, semanticType);
                                                }
                                            }
                                        }
                                    }

                                    // 2. Build the Universal Alias Map (resolving ML partial-matches to Canonical parents)
                                    const aliasMap = new Map<string, { canonicalText: string, semanticType: string }>();
                                    
                                    // Sort by length descending to ensure full names take precedence as Canonical Parents
                                    const sortedCanonicals = Array.from(canonicalEntities.keys()).sort((a, b) => b.length - a.length);

                                    for (const canonicalText of sortedCanonicals) {
                                        const semanticType = canonicalEntities.get(canonicalText)!;
                                        
                                        // Helper to safely register aliases and detect ambiguity
                                        const registerAlias = (alias: string, targetCanonical: string) => {
                                            if (!aliasMap.has(alias)) {
                                                aliasMap.set(alias, { canonicalText: targetCanonical, semanticType });
                                            } else {
                                                const existing = aliasMap.get(alias)!;
                                                // If an alias belongs to multiple distinct canonical parents, it is ambiguous.
                                                if (existing.canonicalText !== targetCanonical) {
                                                    // If the existing longer parent actually contains this new target,
                                                    // it is NOT a conflict between two different people. It's just the ML model
                                                    // separately extracting a sub-component (e.g. first name) after already extracting the full name.
                                                    const isSubstring = existing.canonicalText.includes(targetCanonical) || targetCanonical.includes(existing.canonicalText);
                                                    
                                                    if (!isSubstring) {
                                                        // Genuine conflict (e.g. two distinct people sharing the same first name). Elevate to ambiguous canonical.
                                                        aliasMap.set(alias, { canonicalText: alias, semanticType });
                                                    }
                                                }
                                            }
                                        };

                                        // Always map the exact canonical phrase to itself
                                        registerAlias(canonicalText, canonicalText);

                                        // Split PERSON entities for fuzzy matching
                                        if (semanticType === 'PERSON') {
                                            const parts = canonicalText.split(/\s+/);
                                            if (parts.length > 1) {
                                                for (const part of parts) {
                                                    if (part.length >= 3) {
                                                        registerAlias(part, canonicalText);
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // 3. Execute exactly ONE sweep pass, sorted by length descending
                                    const sortedAliases = Array.from(aliasMap.keys()).sort((a, b) => b.length - a.length);

                                    for (const alias of sortedAliases) {
                                        const { canonicalText, semanticType } = aliasMap.get(alias)!;
                                        
                                        // Ensure the canonical text is registered in the vault so we can derive aliases from it
                                        const canonicalToken = vaultManager.redactEntity(tabId, semanticType, canonicalText);
                                        
                                        // Safe sweeping ignoring existing tokens
                                        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                        const regex = new RegExp(`\\b${escapedAlias}\\b`, 'gi');
                                        
                                        redacted = replaceOutsideTokens(redacted, regex, (match) => {
                                            // If the match exactly matches the canonical form (case-sensitive), use the primary token
                                            if (match === canonicalText) {
                                                return canonicalToken;
                                            }
                                            // Otherwise it's a variant (lowercase, partial), generate an alias token!
                                            return vaultManager.redactAlias(tabId, canonicalText, match);
                                        });
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