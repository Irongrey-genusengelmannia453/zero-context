import { describe, it, expect } from 'vitest';
import { extractTextForML } from './lexer';

describe('extractTextForML', () => {
    it('should return standard prose entirely', () => {
        const prose = "My name is John Doe and I live in Seattle. Please contact me at 555-1234.";
        const result = extractTextForML(prose);
        expect(result).toEqual([prose]);
    });

    it('should extract values from JSON but ignore keys', () => {
        const json = `
        {
            "name": "Jane Doe",
            "address": "123 Main St",
            "age": 30
        }`;
        const result = extractTextForML(json);
        expect(result).toContain('"Jane Doe"');
        expect(result).toContain('"123 Main St"');
        expect(result).not.toContain('"name"');
        expect(result).not.toContain('"address"');
        expect(result).not.toContain('"age"');
    });

    it('should extract string literals from JavaScript code and ignore object keys', () => {
        const code = `
            const API_KEY = "sk-1234567890";
            function greet() {
                console.log('Hello Alice');
            }
            const data = {
                "user_key": "secret_token",
                id: 5
            };
        `;
        const result = extractTextForML(code);
        expect(result).toEqual([
            '"sk-1234567890"',
            "'Hello Alice'",
            '"secret_token"'
        ]);
    });

    it('should extract comments from code', () => {
        const code = `
            // This is a secret about Bob
            const x = 10; /* Block comment about Charlie */
        `;
        const result = extractTextForML(code);
        expect(result).toEqual([
            '// This is a secret about Bob',
            '/* Block comment about Charlie */'
        ]);
    });

    it('should extract string literals correctly even if they contain structural characters', () => {
        const code = `
            const example = "Here is some JSON: { \\"name\\": \\"test\\" }";
        `;
        const result = extractTextForML(code);
        expect(result).toEqual([
            '"Here is some JSON: { \\"name\\": \\"test\\" }"'
        ]);
    });
});
