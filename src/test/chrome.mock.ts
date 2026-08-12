// ─────────────────────────────────────────────────────────────
// Shared Chrome API mock for Vitest.
//
// All test files that need chrome.storage / chrome.runtime /
// chrome.offscreen should import from here instead of
// duplicating the mock inline.
// ─────────────────────────────────────────────────────────────

import { vi } from 'vitest';

/**
 * Creates a fresh Chrome API mock object.
 * Call this in `beforeEach` or at module scope per test file.
 *
 * The `scope` parameter controls which API surfaces are included:
 * - `'storage'`   — chrome.storage.session (vault, regexEngine)
 * - `'full'`      — storage + runtime + offscreen + tabs (pipeline tests)
 */
export function createChromeMock(scope: 'storage' | 'full' = 'storage') {
    const storageMock = {
        session: {
            get: vi.fn((_keys: unknown, callback?: (items: Record<string, unknown>) => void) => {
                const result = {};
                if (typeof callback === 'function') callback(result);
                return Promise.resolve(result);
            }),
            set: vi.fn((_data: unknown, callback?: () => void) => {
                if (typeof callback === 'function') callback();
                return Promise.resolve();
            }),
            remove: vi.fn((_keys: unknown, callback?: () => void) => {
                if (typeof callback === 'function') callback();
                return Promise.resolve();
            }),
        },
        local: {
            get: vi.fn(() => Promise.resolve({})),
        },
    };

    if (scope === 'storage') {
        return { storage: storageMock };
    }

    return {
        storage: storageMock,
        runtime: {
            sendMessage: vi.fn((): Promise<void> => Promise.resolve()),
            onMessage: {
                addListener: vi.fn(),
            },
        },
        offscreen: {
            hasDocument: vi.fn((): Promise<boolean> => Promise.resolve(false)),
            createDocument: vi.fn((): Promise<void> => Promise.resolve()),
            closeDocument: vi.fn((): Promise<void> => Promise.resolve()),
            Reason: { WORKERS: 'WORKERS' },
        },
        tabs: {
            onRemoved: { addListener: vi.fn() },
            onUpdated: { addListener: vi.fn() },
        },
    };
}

/**
 * Convenience: creates a mock and stubs it onto `globalThis.chrome`.
 * Returns the mock for assertion access.
 */
export function stubChromeGlobal(scope: 'storage' | 'full' = 'storage') {
    const mock = createChromeMock(scope);
    vi.stubGlobal('chrome', mock);
    return mock;
}
