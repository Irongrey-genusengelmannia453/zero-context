import { z } from 'zod';

// 1. Define the raw outputs from Transformers.js
export const MLTagSchema = z.union([
    z.literal('PER'),
    z.literal('LOC'),
    z.literal('ORG'),
    z.literal('MISC'),
    z.string() // Fallback for unexpected ML tags
]);
export type MLTag = z.infer<typeof MLTagSchema>;

// 2. Define our allowed Semantic Outputs
export const SemanticEntitySchema = z.union([
    z.literal('PERSON'),
    z.literal('LOCATION'),
    z.literal('ORGANIZATION'),
    z.literal('PII'), // Fallback
]);
export type SemanticEntity = z.infer<typeof SemanticEntitySchema>;

// 3. Mapping Dictionary using the `satisfies` operator
// MISC is intentionally omitted as it will be filtered out
export const EntitySemanticMap = {
    'PER': 'PERSON',
    'LOC': 'LOCATION',
    'ORG': 'ORGANIZATION',
} satisfies Partial<Record<MLTag, SemanticEntity>>;

/**
 * Maps a raw ML NER tag to a SemanticEntity.
 * Returns null if the entity should be skipped (e.g., MISC).
 */
export function mapMLTagToSemantic(rawTag: string): SemanticEntity | null {
    // Strip B- / I- prefixes if they exist
    const cleanTag = rawTag.replace(/^[BI]-/, '');

    if (cleanTag === 'MISC' || cleanTag === 'O') {
        return null;
    }

    // Check if the tag is in our map
    if (cleanTag in EntitySemanticMap) {
        return EntitySemanticMap[cleanTag as keyof typeof EntitySemanticMap];
    }

    return 'PII'; // Fallback
}
