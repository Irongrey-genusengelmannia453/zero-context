import { describe, it, expect } from 'vitest';
import { mapMLTagToSemantic } from './semanticMapper';

describe('Semantic Mapper (mapMLTagToSemantic)', () => {
    it('should map PER to PERSON', () => {
        expect(mapMLTagToSemantic('PER')).toBe('PERSON');
    });

    it('should map LOC to LOCATION', () => {
        expect(mapMLTagToSemantic('LOC')).toBe('LOCATION');
    });

    it('should map ORG to ORGANIZATION', () => {
        expect(mapMLTagToSemantic('ORG')).toBe('ORGANIZATION');
    });

    it('should strip BIO prefixes automatically if present', () => {
        // Technically background.ts strips it, but if we want to be safe, the mapper could do it.
        // Or we just rely on background.ts to pass stripped tags.
        // Assuming background.ts strips it, we just test the stripped inputs.
        // Let's add a test just in case we decide the mapper should be robust.
        expect(mapMLTagToSemantic('B-PER')).toBe('PERSON');
        expect(mapMLTagToSemantic('I-ORG')).toBe('ORGANIZATION');
    });

    it('should return null for MISC (ignore tag)', () => {
        expect(mapMLTagToSemantic('MISC')).toBeNull();
        expect(mapMLTagToSemantic('B-MISC')).toBeNull();
    });

    it('should return null for O (outside entities)', () => {
        expect(mapMLTagToSemantic('O')).toBeNull();
    });

    it('should fallback to PII for completely unknown tags', () => {
        expect(mapMLTagToSemantic('UNKNOWN_TAG')).toBe('PII');
    });
});
