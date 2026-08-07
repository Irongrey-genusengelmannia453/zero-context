/**
 * Lightweight lexer to extract string literals and comments from Code/JSON,
 * or return the raw text if it is standard prose.
 */

// A heuristic to detect if a string is likely Code or JSON.
function isLikelyCodeOrJson(input: string): boolean {
    // 1. Valid JSON Check
    try {
        JSON.parse(input);
        return true;
    } catch (e) {
        // Continue
    }

    // 2. Common Code patterns (not just single words which occur in English)
    if (/\b(?:const|let|var)\s+\w+\s*=/.test(input)) return true;
    if (/\bfunction\s*\w*\s*\(/.test(input)) return true;
    if (/\b(?:import|export)\s+.*?\s+from\b/.test(input)) return true;
    if (/\bconsole\.log\s*\(/.test(input)) return true;

    // 3. JSON fragment / Object literal (e.g., "key": "value" or "key": [ )
    if (/".*?"\s*:\s*(?:".*?"|\d+|true|false|null|[{[])/.test(input)) return true;

    // 4. Contains code blocks
    if (input.includes("{\n") || input.includes(";\n") || input.includes("();")) return true;

    return false;
}

export function extractTextForML(input: string): string[] {
    if (!isLikelyCodeOrJson(input)) {
        return [input];
    }

    const results: string[] = [];
    
    // Regex to match:
    // 1. Block comments /* ... */
    // 2. Line comments // ...
    // 3. Double quote strings "..." (no newlines allowed to prevent runaway captures)
    // 4. Single quote strings '...' (no newlines allowed)
    // 5. Backtick strings `...` (newlines allowed)
    const tokenRegex = /\/\*[\s\S]*?\*\/|\/\/.*|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|`(?:\\.|[^`\\])*`/g;
    
    let match;
    while ((match = tokenRegex.exec(input)) !== null) {
        const token = match[0];
        
        // If it's a string literal, check if it's a JSON/Object key
        if (token.startsWith('"') || token.startsWith("'")) {
            const nextChars = input.substring(match.index + token.length);
            // If the string is immediately followed by a colon (ignoring whitespace), it's a key
            if (/^\s*:/.test(nextChars)) {
                continue; // Skip keys
            }
        }
        
        results.push(token);
    }
    
    return results;
}
