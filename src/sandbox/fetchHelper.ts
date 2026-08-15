/**
 * Normalizes input from fetch (string, URL, or Request object) to a URL string.
 * Prevents the Naive .toString() trap where Request instances become "[object Request]".
 */
export function extractFetchUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') {
        return input;
    }
    if (input instanceof URL) {
        return input.href;
    }
    if (typeof input === 'object' && input !== null && 'url' in input) {
        return (input as Request).url;
    }
    return String(input);
}

/**
 * Checks whether a URL should be intercepted for Offscreen Cache Storage delegation.
 */
export function isModelDownloadUrl(url: string): boolean {
    return url.includes('huggingface.co') || url.includes('hf.co');
}
