import { describe, it, expect, beforeEach, vi } from 'vitest';
import { redactText } from './regexEngine';
import { VaultManager } from './vault';

// Robust Chrome Storage Mock supporting both Promises and Callbacks
const chromeMock = {
    storage: {
        session: {
            get: vi.fn((_keys, callback) => {
                const mockResult = {};
                if (typeof callback === 'function') {
                    callback(mockResult);
                }
                return Promise.resolve(mockResult);
            }),
            set: vi.fn((_data, callback) => {
                if (typeof callback === 'function') {
                    callback();
                }
                return Promise.resolve();
            }),
            remove: vi.fn((_keys, callback) => {
                if (typeof callback === 'function') {
                    callback();
                }
                return Promise.resolve();
            }),
        }
    },
    runtime: {
        sendMessage: vi.fn(),
    },
    tabs: {
        onRemoved: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() }
    }
};

vi.stubGlobal('chrome', chromeMock);

describe('Regex Engine & Luhn Validation', () => {
    let vault: VaultManager;
    const tabId = 1;

    beforeEach(async () => {
        vi.clearAllMocks();
        vault = new VaultManager();
        await vault.ensureHydrated();
    });

    describe('Emails Redaction (EMAIL)', () => {
        it('should redact valid standard emails', () => {
            const input = 'My email is test@example.com.';
            const redacted = redactText(tabId, input, vault);
            expect(redacted).toMatch(/My email is \[EMAIL_\d{5,6}\]\./);
        });

        it('should redact emails with subdomains and plus addressing', () => {
            const input = 'Reach out at first.last+tag@sub.domain.co.uk';
            const redacted = redactText(tabId, input, vault);
            expect(redacted).toMatch(/Reach out at \[EMAIL_\d{5,6}\]/);
        });

        it('should correctly deduplicate identical emails', () => {
            const input = 'Contact john@example.com or john@example.com.';
            const redacted = redactText(tabId, input, vault);
            const match = redacted.match(/\[EMAIL_\d{5,6}\]/);
            expect(match).toBeTruthy();
            expect(redacted).toBe(`Contact ${match![0]} or ${match![0]}.`);
        });

        it('should assign different tokens to different emails', () => {
            const input = 'A: a@test.com, B: b@test.com';
            const redacted = redactText(tabId, input, vault);
            const matches = redacted.match(/\[EMAIL_\d{5,6}\]/g);
            expect(matches).toHaveLength(2);
            expect(matches![0]).not.toBe(matches![1]);
        });
    });

    describe('Phone Numbers Redaction (PHONE)', () => {
        it('should redact standard US phone numbers with dashes', () => {
            const input = 'Call 555-123-4567 today.';
            expect(redactText(tabId, input, vault)).toMatch(/Call \[PHONE_\d{5,6}\] today\./);
        });

        it('should redact phone numbers with parentheses and spaces', () => {
            const input = 'Cell: (555) 123 4567';
            expect(redactText(tabId, input, vault)).toMatch(/Cell: \[PHONE_\d{5,6}\]/);
        });

        it('should redact phone numbers with country codes', () => {
            const input = 'International +1-555-123-4567';
            expect(redactText(tabId, input, vault)).toMatch(/International \[PHONE_\d{5,6}\]/);
        });

        it('should redact phone numbers with dots', () => {
            const input = 'Dots: 555.123.4567';
            expect(redactText(tabId, input, vault)).toMatch(/Dots: \[PHONE_\d{5,6}\]/);
        });
    });

    describe('US Social Security Numbers (SSN)', () => {
        it('should redact valid formatted US SSNs', () => {
            const input = 'My SSN is 123-45-6789.';
            expect(redactText(tabId, input, vault)).toMatch(/My SSN is \[SSN_\d{5,6}\]\./);
        });

        it('should ignore invalid area codes (000, 666, 900+)', () => {
            expect(redactText(tabId, '000-12-3456', vault)).toBe('000-12-3456');
            expect(redactText(tabId, '666-12-3456', vault)).toBe('666-12-3456');
            expect(redactText(tabId, '900-12-3456', vault)).toBe('900-12-3456');
        });

        it('should ignore invalid group codes (00)', () => {
            expect(redactText(tabId, '123-00-4567', vault)).toBe('123-00-4567');
        });

        it('should ignore invalid serial numbers (0000)', () => {
            expect(redactText(tabId, '123-45-0000', vault)).toBe('123-45-0000');
        });
    });

    describe('Canadian Social Insurance Numbers (SIN)', () => {
        it('should redact valid Canadian SINs (passes Luhn)', () => {
            const validSIN = '046-454-286'; // Modulus 10 compliant
            expect(redactText(tabId, validSIN, vault)).toMatch(/\[SIN_\d{5,6}\]/);
        });

        it('should redact valid Canadian SINs without dashes', () => {
            const validSIN = '046454286'; // Modulus 10 compliant
            expect(redactText(tabId, validSIN, vault)).toMatch(/\[SIN_\d{5,6}\]/);
        });

        it('should reject invalid Canadian SINs (fails Luhn)', () => {
            const invalidSIN = '123-456-789';
            expect(redactText(tabId, invalidSIN, vault)).toBe(invalidSIN);
        });
    });

    describe('Credit Cards (CARD)', () => {
        it('should redact valid Visa cards (passes Luhn)', () => {
            // Visa prefix 4, 16 digits
            const validVisa = '4111111111111111'; // Common test card (passes Luhn)
            expect(redactText(tabId, validVisa, vault)).toMatch(/\[CARD_\d{5,6}\]/);
        });

        it('should redact valid MasterCard (passes Luhn)', () => {
            const validMC = '5555555555554444'; // Example valid luhn
            expect(redactText(tabId, validMC, vault)).toMatch(/\[CARD_\d{5,6}\]/);
        });

        it('should ignore strings that look like cards but fail Luhn', () => {
            const invalidVisa = '4111111111111112'; // Luhn will fail
            expect(redactText(tabId, invalidVisa, vault)).toBe(invalidVisa);
        });
    });

    describe('Complex Text and Unredaction', () => {
        it('should handle mixed entities in one text', () => {
            const input = 'Call 555-123-4567 or email test@example.com about 123-45-6789.';
            const redacted = redactText(tabId, input, vault);

            expect(redacted).toMatch(/Call \[PHONE_\d{5,6}\] or email \[EMAIL_\d{5,6}\] about \[SSN_\d{5,6}\]\./);
        });

        it('should successfully unredact mixed tokens', () => {
            const input = 'My email is user@example.com.';
            const redacted = redactText(tabId, input, vault);
            const restored = vault.unredactText(tabId, redacted);
            expect(restored).toBe(input);
        });

        it('should return token as-is if unredacting from an expired session', () => {
            const fakeToken = '[EMAIL_99999]';
            const restored = vault.unredactText(tabId, `Hello ${fakeToken}`);
            // Since it's not in the vault map, it should return the token unmodified
            expect(restored).toBe(`Hello ${fakeToken}`);
        });
    });
});
