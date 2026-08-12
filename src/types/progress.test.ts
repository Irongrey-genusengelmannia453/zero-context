import { describe, it, expect } from 'vitest';
import { ModelProgressSchema, RedactionProgressSchema } from './progress';

describe('Message Schemas', () => {
    describe('ModelProgressSchema', () => {
        it('should validate a valid progress payload', () => {
            const validPayload = {
                type: 'MODEL_PROGRESS',
                status: 'progress',
                file: 'model.onnx',
                progress: 45.5,
                loaded: 45500,
                total: 100000,
            };
            const result = ModelProgressSchema.safeParse(validPayload);
            expect(result.success).toBe(true);
        });

        it('should reject invalid status types', () => {
            const invalidPayload = {
                type: 'MODEL_PROGRESS',
                status: 'INVALID_STATUS', // Edge case: unsupported status
            };
            const result = ModelProgressSchema.safeParse(invalidPayload);
            expect(result.success).toBe(false);
        });

        it('should allow optional fields to be missing for "initiate" or "ready"', () => {
            const initiatePayload = {
                type: 'MODEL_PROGRESS',
                status: 'ready',
            };
            const result = ModelProgressSchema.safeParse(initiatePayload);
            expect(result.success).toBe(true);
        });

        it('should reject wrong type discriminator', () => {
            const invalidPayload = {
                type: 'WRONG_TYPE',
                status: 'progress',
            };
            const result = ModelProgressSchema.safeParse(invalidPayload);
            expect(result.success).toBe(false);
        });
    });

    describe('RedactionProgressSchema', () => {
        it('should validate a correct chunking payload', () => {
            const validPayload = {
                type: 'REDACTION_PROGRESS',
                chunksProcessed: 5,
                totalChunks: 10,
            };
            const result = RedactionProgressSchema.safeParse(validPayload);
            expect(result.success).toBe(true);
        });

        it('should reject if chunks are missing', () => {
            const invalidPayload = {
                type: 'REDACTION_PROGRESS',
                chunksProcessed: 5,
            };
            const result = RedactionProgressSchema.safeParse(invalidPayload);
            expect(result.success).toBe(false);
        });
    });
});
