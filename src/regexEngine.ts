import { VaultManager } from './vault';

// Modulus 10 Validator for CCs and Canadian SINs
function isLuhnValid(numberStr: string): boolean {
    // Remove all non-digits
    const digits = numberStr.replace(/\D/g, '');
    if (!digits) return false;

    let sum = 0;
    let isSecond = false;

    for (let i = digits.length - 1; i >= 0; i--) {
        let d = parseInt(digits.charAt(i), 10);
        if (isSecond) {
            d *= 2;
            if (d > 9) {
                d -= 9;
            }
        }
        sum += d;
        isSecond = !isSecond;
    }
    return sum % 10 === 0;
}

// Strict area/group checks for US SSN (no 000, 666, 900-999)
function isValidUSSSN(ssn: string): boolean {
    const parts = ssn.split('-');
    if (parts.length !== 3) return false;
    
    const area = parseInt(parts[0], 10);
    const group = parseInt(parts[1], 10);
    const serial = parseInt(parts[2], 10);

    if (area === 0 || area === 666 || area >= 900) return false;
    if (group === 0) return false;
    if (serial === 0) return false;

    return true;
}

// Regex patterns
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_REGEX = /(?<!\w)(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const US_SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const CANADIAN_SIN_REGEX = /\b(?:\d{3}-\d{3}-\d{3}|\d{9})\b/g;
// Basic CC regex (13 to 19 digits with optional spaces/dashes)
const CC_REGEX = /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|2(?:22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[0-1][0-9]|720)[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})(?:[\s-]*\d+)*\b/g;

export function redactText(tabId: number, text: string, vault: VaultManager): string {
    let redacted = text;

    // 1. Credit Cards
    redacted = redacted.replace(CC_REGEX, (match) => {
        const cleanMatch = match.replace(/[\s-]/g, '');
        if (cleanMatch.length >= 13 && cleanMatch.length <= 19 && isLuhnValid(cleanMatch)) {
            return vault.redactEntity(tabId, 'CARD', match);
        }
        return match;
    });

    // 2. US SSNs
    redacted = redacted.replace(US_SSN_REGEX, (match) => {
        if (isValidUSSSN(match)) {
            return vault.redactEntity(tabId, 'SSN', match);
        }
        return match;
    });

    // 3. Canadian SINs
    redacted = redacted.replace(CANADIAN_SIN_REGEX, (match) => {
        // Only process if it wasn't already processed as SSN (they share format sometimes)
        if (match.includes('[SSN_')) return match; 
        
        const cleanMatch = match.replace(/[\s-]/g, '');
        if (cleanMatch.length === 9 && isLuhnValid(cleanMatch)) {
            return vault.redactEntity(tabId, 'SIN', match);
        }
        return match;
    });

    // 4. Emails
    redacted = redacted.replace(EMAIL_REGEX, (match) => {
        return vault.redactEntity(tabId, 'EMAIL', match);
    });

    // 5. Phone Numbers
    redacted = redacted.replace(PHONE_REGEX, (match) => {
        if (match.startsWith('000-000-')) return match; // Skip zero-masked SIN tokens
        return vault.redactEntity(tabId, 'PHONE', match);
    });

    return redacted;
}
