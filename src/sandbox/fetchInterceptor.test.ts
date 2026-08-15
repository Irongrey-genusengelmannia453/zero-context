import { describe, it, expect } from 'vitest';
import { extractFetchUrl, isModelDownloadUrl } from './fetchHelper';

describe('Fetch Interceptor & URL Normalization (TDD)', () => {
    describe('extractFetchUrl', () => {
        it('correctly extracts URL from a plain string', () => {
            const url = 'https://huggingface.co/Xenova/distilbert/model.onnx';
            expect(extractFetchUrl(url)).toBe(url);
        });

        it('correctly extracts URL from a URL object', () => {
            const url = 'https://huggingface.co/Xenova/distilbert/config.json';
            const urlObj = new URL(url);
            expect(extractFetchUrl(urlObj)).toBe(url);
        });

        it('CRITICAL: correctly extracts URL from a Request object instead of returning "[object Request]"', () => {
            const url = 'https://huggingface.co/Xenova/distilbert/model_quantized.onnx';
            const requestObj = new Request(url);
            // Verify that naive .toString() produces "[object Request]"
            expect(requestObj.toString()).toBe('[object Request]');
            // Verify our extractor extracts the actual URL
            expect(extractFetchUrl(requestObj)).toBe(url);
        });
    });

    describe('isModelDownloadUrl', () => {
        it('identifies standard huggingface.co model URLs', () => {
            expect(isModelDownloadUrl('https://huggingface.co/Xenova/distilbert/resolve/main/onnx/model.onnx')).toBe(true);
            expect(isModelDownloadUrl('https://huggingface.co/Xenova/distilbert/resolve/main/config.json')).toBe(true);
        });

        it('identifies hf.co short URLs and CDN endpoints', () => {
            expect(isModelDownloadUrl('https://hf.co/Xenova/distilbert/resolve/main/tokenizer.json')).toBe(true);
            expect(isModelDownloadUrl('https://cdn-lfs.hf.co/repos/1234/5678')).toBe(true);
            expect(isModelDownloadUrl('https://cdn-lfs-us-1.hf.co/repos/abcd')).toBe(true);
            expect(isModelDownloadUrl('https://cdn-lfs.huggingface.co/repos/xyz')).toBe(true);
        });

        it('rejects non-model URLs', () => {
            expect(isModelDownloadUrl('https://chatgpt.com/')).toBe(false);
            expect(isModelDownloadUrl('https://api.openai.com/v1/chat/completions')).toBe(false);
            expect(isModelDownloadUrl('https://claude.ai/')).toBe(false);
            expect(isModelDownloadUrl('chrome-extension://abc/popup.html')).toBe(false);
        });
    });
});
