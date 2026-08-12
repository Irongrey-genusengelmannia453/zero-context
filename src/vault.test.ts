import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VaultManager } from './vault';

// Mock chrome.storage.session
const chromeMock = {
    storage: {
        session: {
            get: vi.fn((_keys, callback) => {
                if (typeof callback === 'function') callback({});
                return Promise.resolve({});
            }),
            set: vi.fn((_data, callback) => {
                if (typeof callback === 'function') callback();
                return Promise.resolve();
            }),
            remove: vi.fn((_keys, callback) => {
                if (typeof callback === 'function') callback();
                return Promise.resolve();
            }),
        }
    }
};

vi.stubGlobal('chrome', chromeMock);

describe('VaultManager', () => {
    let vault: VaultManager;

    beforeEach(async () => {
        vi.clearAllMocks();
        vault = new VaultManager();
        await vault.ensureHydrated();
    });

    describe('Tab Isolation', () => {
        it('should keep data completely isolated between tab IDs', () => {
            const tokenTab1 = vault.redactEntity(1, 'EMAIL', 'user@test.com');
            const tokenTab2 = vault.redactEntity(2, 'EMAIL', 'user@test.com');

            // Tokens should not be exactly identical because of unique sessionSalts or counters
            expect(tokenTab1).not.toBe(tokenTab2);

            // Unredacting in tab 1 should work
            expect(vault.unredactText(1, `Hello ${tokenTab1}`)).toBe('Hello user@test.com');
            
            // Tab 2 should NOT be able to unredact Tab 1's token
            expect(vault.unredactText(2, `Hello ${tokenTab1}`)).toBe(`Hello ${tokenTab1}`);
        });
    });

    describe('Deduplication', () => {
        it('should return the exact same token for identical inputs in the same tab (O(1))', () => {
            const token1 = vault.redactEntity(1, 'EMAIL', 'same@example.com');
            const token2 = vault.redactEntity(1, 'EMAIL', 'same@example.com');

            expect(token1).toBe(token2);
        });

        it('should issue different tokens for different inputs', () => {
            const token1 = vault.redactEntity(1, 'EMAIL', 'user1@example.com');
            const token2 = vault.redactEntity(1, 'EMAIL', 'user2@example.com');

            expect(token1).not.toBe(token2);
        });
    });

    describe('Collision Resistance', () => {
        it('should correctly increment globalCounter ensuring unique token IDs', () => {
            const token1 = vault.redactEntity(1, 'EMAIL', 'first@example.com');
            const token2 = vault.redactEntity(1, 'PHONE', '555-555-5555');
            const token3 = vault.redactEntity(1, 'CARD', '4111111111111111');

            // Extract the numbers from the tokens to ensure they are distinct
            // Tokens look like user.141@example.com where 14 is salt, 1 is counter
            const extractNum = (str: string) => str.replace(/\D/g, '');
            expect(extractNum(token1)).not.toBe(extractNum(token2));
            expect(extractNum(token2)).not.toBe(extractNum(token3));
        });
    });

    describe('Unredaction Flow', () => {
        it('should correctly unredact multiple distinct tokens in a single string', () => {
            const token1 = vault.redactEntity(1, 'EMAIL', 'a@example.com');
            const token2 = vault.redactEntity(1, 'EMAIL', 'b@example.com');

            const input = `Please email ${token1} or ${token2}.`;
            const restored = vault.unredactText(1, input);

            expect(restored).toBe('Please email a@example.com or b@example.com.');
        });

        it('should handle unredaction requests for completely unknown tabs safely', () => {
            expect(vault.unredactText(999, 'Nothing to see here')).toBe('Nothing to see here');
        });
    });

    describe('Memory Clear / Flush', () => {
        it('should purge the tab from memory and chrome.storage', async () => {
            const token = vault.redactEntity(1, 'EMAIL', 'target@example.com');
            
            // Verify it was saved
            expect(vault.unredactText(1, token)).toBe('target@example.com');
            expect(chromeMock.storage.session.set).toHaveBeenCalled();

            // Clear tab
            await vault.clearTab(1);

            // Verify it was removed from memory
            expect(vault.unredactText(1, token)).toBe(token);
            // Verify chrome storage was called
            expect(chromeMock.storage.session.remove).toHaveBeenCalledWith('1');
        });
    });

    describe('Semantic Token Formatting (Dot Style)', () => {
        it('should format Semantic Entities (PERSON, LOCATION, ORGANIZATION) as TYPE.ID', () => {
            const token1 = vault.redactEntity(1, 'PERSON', 'John Doe');
            const token2 = vault.redactEntity(1, 'LOCATION', 'New York');
            const token3 = vault.redactEntity(1, 'ORGANIZATION', 'Google');

            // Dot style ensures no square brackets or XML tags
            expect(token1).toMatch(/^PERSON\.\d+$/);
            expect(token2).toMatch(/^LOCATION\.\d+$/);
            expect(token3).toMatch(/^ORGANIZATION\.\d+$/);
        });

        it('should format generic fallbacks (PII) as PII.ID', () => {
            const token = vault.redactEntity(1, 'PII', 'Some secret');
            expect(token).toMatch(/^PII\.\d+$/);
        });

        it('should correctly unredact Dot style tokens', () => {
            const token = vault.redactEntity(2, 'PERSON', 'Jane Smith');
            expect(token).toMatch(/^PERSON\.\d+$/);
            
            const input = `Hello ${token}, how are you?`;
            const restored = vault.unredactText(2, input);
            expect(restored).toBe('Hello Jane Smith, how are you?');
        });
    });

    describe('Alias Redaction (Sub-Tokens)', () => {
        it('should generate sub-tokens for variants and unredact them correctly', () => {
            const canonicalToken = vault.redactEntity(1, 'PERSON', 'Michael Thompson');
            const aliasToken1 = vault.redactAlias(1, 'Michael Thompson', 'Michael');
            const aliasToken2 = vault.redactAlias(1, 'Michael Thompson', 'michael');

            expect(aliasToken1).toMatch(new RegExp(`^${canonicalToken}\\.\\d+$`));
            expect(aliasToken2).toMatch(new RegExp(`^${canonicalToken}\\.\\d+$`));
            expect(aliasToken1).not.toBe(aliasToken2);

            const input = `Both ${canonicalToken} and ${aliasToken1} and ${aliasToken2} are here.`;
            const restored = vault.unredactText(1, input);
            
            expect(restored).toBe('Both Michael Thompson and Michael and michael are here.');
        });
    });
});
