// ─────────────────────────────────────────────────────────────
// NER Processor — Pure function that transforms raw NER model
// output into redacted text via the VaultManager.
//
// CONSTRAINT: This module has ZERO Chrome API dependencies.
// It receives all inputs and returns a result. The caller
// (background.ts) handles all extension coordination.
// ─────────────────────────────────────────────────────────────

import type { VaultManager } from './vault';
import type { NerResultSet } from './types/ner';
import { mapMLTagToSemantic } from './semanticMapper';
import { replaceOutsideTokens } from './regexEngine';

/**
 * Processes raw NER results and applies entity redaction to the input text.
 *
 * This is a pure transformation: text in → redacted text out.
 * All Chrome messaging, storage, and async coordination lives in the caller.
 *
 * @param text       - The original (or partially-redacted) text to sweep.
 * @param nerResults - The batched NER output from the Transformers.js model.
 * @param tabId      - The tab ID for vault scoping.
 * @param vault      - The VaultManager instance (passed in, not imported).
 * @returns The text with all detected entities replaced by vault tokens.
 */
export function processNerResults(
    text: string,
    nerResults: NerResultSet,
    tabId: number,
    vault: VaultManager,
): string {
    let redacted = text;

    // 1. Build canonical entity map from NER output (score > 0.6)
    const canonicalEntities = new Map<string, string>();
    for (const entities of nerResults) {
        if (!entities || !Array.isArray(entities)) continue;
        for (const ent of entities) {
            if (ent.score > 0.6) {
                const rawType = ent.entity_group || 'PII';
                const semanticType = mapMLTagToSemantic(rawType);
                if (semanticType !== null) {
                    const cleanWord = ent.word.replace(/^##/, '');
                    canonicalEntities.set(cleanWord, semanticType);
                }
            }
        }
    }

    // 2. Build alias map (canonical phrases + PERSON sub-parts)
    const aliasMap = new Map<string, { canonicalText: string; semanticType: string }>();
    const sortedCanonicals = Array.from(canonicalEntities.keys()).sort((a, b) => b.length - a.length);

    for (const canonicalText of sortedCanonicals) {
        const semanticType = canonicalEntities.get(canonicalText)!;

        const registerAlias = (alias: string, targetCanonical: string) => {
            if (!aliasMap.has(alias)) {
                aliasMap.set(alias, { canonicalText: targetCanonical, semanticType });
            } else {
                const existing = aliasMap.get(alias)!;
                if (existing.canonicalText !== targetCanonical) {
                    const isSubstring = existing.canonicalText.includes(targetCanonical)
                        || targetCanonical.includes(existing.canonicalText);
                    if (!isSubstring) {
                        // Genuine ambiguity: two distinct entities share this alias
                        aliasMap.set(alias, { canonicalText: alias, semanticType });
                    }
                }
            }
        };

        registerAlias(canonicalText, canonicalText);

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

    // 3. Single sweep pass — longest aliases first to prevent partial matches
    const sortedAliases = Array.from(aliasMap.keys()).sort((a, b) => b.length - a.length);

    for (const alias of sortedAliases) {
        const { canonicalText } = aliasMap.get(alias)!;
        const canonicalToken = vault.redactEntity(tabId, aliasMap.get(alias)!.semanticType, canonicalText);

        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedAlias}\\b`, 'gi');

        redacted = replaceOutsideTokens(redacted, regex, (match) => {
            if (match === canonicalText) {
                return canonicalToken;
            }
            return vault.redactAlias(tabId, canonicalText, match);
        });
    }

    return redacted;
}
