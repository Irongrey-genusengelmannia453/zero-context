import { describe, it, expect } from 'vitest';
import { 
  DomainEntrySchema, 
  DomainConfigStateSchema, 
  DEFAULT_AI_DOMAINS,
  AIHostPatternSchema,
  HostnameInputSchema,
  AddDomainResultSchema
} from './domain';

describe('Domain Schemas (Blue Phase Types)', () => {
  describe('AIHostPatternSchema', () => {
    it('accepts valid string patterns', () => {
      expect(AIHostPatternSchema.safeParse('*://*.chatgpt.com/*').success).toBe(true);
      expect(AIHostPatternSchema.safeParse('https://claude.ai/*').success).toBe(true);
    });

    it('rejects empty strings for patterns', () => {
      expect(AIHostPatternSchema.safeParse('').success).toBe(false);
    });
  });

  describe('DomainEntrySchema', () => {
    it('validates a compliant BUILT_IN domain', () => {
      const result = DomainEntrySchema.safeParse({
        type: 'BUILT_IN',
        id: 'chatgpt',
        pattern: '*://*.chatgpt.com/*',
        enabled: true
      });
      expect(result.success).toBe(true);
    });

    it('validates a compliant CUSTOM domain', () => {
      const result = DomainEntrySchema.safeParse({
        type: 'CUSTOM',
        id: '123e4567-e89b-12d3-a456-426614174000', // valid UUID
        pattern: '*://*.custom-ai.com/*',
        enabled: true,
        addedAt: 1690000000000
      });
      expect(result.success).toBe(true);
    });

    it('rejects a CUSTOM domain with an invalid UUID format', () => {
      const result = DomainEntrySchema.safeParse({
        type: 'CUSTOM',
        id: 'invalid-uuid-string',
        pattern: '*://*.custom-ai.com/*',
        enabled: true,
        addedAt: 1690000000000
      });
      expect(result.success).toBe(false);
    });

    it('rejects a CUSTOM domain missing the addedAt timestamp', () => {
      const result = DomainEntrySchema.safeParse({
        type: 'CUSTOM',
        id: '123e4567-e89b-12d3-a456-426614174000',
        pattern: '*://*.custom-ai.com/*',
        enabled: true
      });
      expect(result.success).toBe(false);
    });

    it('rejects an unknown discriminated union type', () => {
      const result = DomainEntrySchema.safeParse({
        type: 'UNKNOWN_TYPE',
        id: 'test',
        pattern: '*://*.test.com/*',
        enabled: true
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DomainConfigStateSchema', () => {
    it('validates a complete, correct state object', () => {
      const state = {
        version: 1,
        domains: DEFAULT_AI_DOMAINS
      };
      const result = DomainConfigStateSchema.safeParse(state);
      expect(result.success).toBe(true);
    });

    it('rejects a state with an unsupported version number', () => {
      const state = {
        version: 2, // Strict literal constraint enforces version 1
        domains: DEFAULT_AI_DOMAINS
      };
      expect(DomainConfigStateSchema.safeParse(state).success).toBe(false);
    });

    it('rejects a state with malformed domain entries in the array', () => {
      const state = {
        version: 1,
        domains: [
          { type: 'BUILT_IN', id: 'test' } // Missing pattern and enabled flags
        ]
      };
      expect(DomainConfigStateSchema.safeParse(state).success).toBe(false);
    });
  });

  describe('DEFAULT_AI_DOMAINS Constant', () => {
    it('is strictly valid against the DomainEntrySchema array', () => {
      const result = DomainConfigStateSchema.safeParse({
        version: 1,
        domains: DEFAULT_AI_DOMAINS
      });
      expect(result.success).toBe(true);
    });
  });

  describe('UI & Permissions Types', () => {
    describe('HostnameInputSchema', () => {
      it('accepts valid simple hostnames', () => {
        expect(HostnameInputSchema.safeParse('custom-ai.corp').success).toBe(true);
        expect(HostnameInputSchema.safeParse('ai.company.com').success).toBe(true);
      });
      it('rejects hostnames with protocols or paths', () => {
        expect(HostnameInputSchema.safeParse('https://custom-ai.corp').success).toBe(false);
        expect(HostnameInputSchema.safeParse('custom-ai.corp/path').success).toBe(false);
      });
      it('rejects invalid hostname structures', () => {
        expect(HostnameInputSchema.safeParse('not-a-domain').success).toBe(false);
      });
    });

    describe('AddDomainResultSchema', () => {
      it('validates a SUCCESS result', () => {
        const result = AddDomainResultSchema.safeParse({
          status: 'SUCCESS',
          domain: {
            type: 'CUSTOM',
            id: '123e4567-e89b-12d3-a456-426614174000',
            pattern: '*://*.custom-ai.com/*',
            enabled: true,
            addedAt: 12345
          }
        });
        expect(result.success).toBe(true);
      });
      it('validates an ERROR_PERMISSION_DENIED result', () => {
        expect(AddDomainResultSchema.safeParse({ status: 'ERROR_PERMISSION_DENIED', message: 'Denied' }).success).toBe(true);
      });
      it('rejects unknown status types', () => {
        expect(AddDomainResultSchema.safeParse({ status: 'ERROR_RANDOM', message: 'Denied' }).success).toBe(false);
      });
    });
  });
});
