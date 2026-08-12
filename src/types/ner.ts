// ─────────────────────────────────────────────────────────────
// Shared NER (Named Entity Recognition) type contracts.
// Used by: background.ts, nerProcessor.ts, sandbox.ts
// ─────────────────────────────────────────────────────────────

/**
 * A single entity detected by the NER model (Transformers.js token-classification).
 * This is the JSON-safe plain object form — NOT the raw Transformers.js class instance.
 */
export interface NerEntity {
    word: string;
    entity_group: string;
    score: number;
    start: number;
    end: number;
}

/** A batch of NER results: one inner array per input text chunk. */
export type NerResultSet = NerEntity[][];
