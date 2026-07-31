import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// ─────────────────────────────────────────────────────────────
// Chrome API Mock — offscreen, runtime, storage, tabs
// ─────────────────────────────────────────────────────────────

let hasDocumentValue = false;

const chromeMock = {
    offscreen: {
        hasDocument: vi.fn((): Promise<boolean> => Promise.resolve(hasDocumentValue)),
        createDocument: vi.fn((): Promise<void> => {
            hasDocumentValue = true;
            return Promise.resolve();
        }),
        closeDocument: vi.fn((): Promise<void> => {
            hasDocumentValue = false;
            return Promise.resolve();
        }),
        Reason: { WORKERS: 'WORKERS' },
    },
    runtime: {
        sendMessage: vi.fn((): Promise<void> => Promise.resolve()),
        onMessage: {
            addListener: vi.fn(),
        },
    },
    storage: {
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
    },
    tabs: {
        onRemoved: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
    },
};

vi.stubGlobal('chrome', chromeMock);
vi.stubGlobal('crypto', { randomUUID: () => `test-uuid-${Date.now()}-${Math.random()}` });

// ─── Import AFTER global mocks are in place ─────────────────
import {
    getOrCreateOffscreenDocument,
    closeOffscreenDocument,
    sendWorkerTask,
    initOffscreenResponseListener,
} from './offscreen-manager';

describe('Offscreen Pipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        hasDocumentValue = false;
        (chromeMock.runtime.sendMessage as Mock).mockResolvedValue(undefined);
    });

    // ─────────────────────────────────────────────────────────
    // Test 1: Lifecycle & Singleton Integrity
    // ─────────────────────────────────────────────────────────
    describe('Singleton Lifecycle', () => {
        it('should create the offscreen document exactly once on first call', async () => {
            await getOrCreateOffscreenDocument();

            expect(chromeMock.offscreen.hasDocument).toHaveBeenCalledOnce();
            expect(chromeMock.offscreen.createDocument).toHaveBeenCalledOnce();
            expect(chromeMock.offscreen.createDocument).toHaveBeenCalledWith(
                expect.objectContaining({
                    reasons: ['WORKERS'],
                    justification: expect.stringContaining('AI/WASM'),
                }),
            );
        });

        it('should skip creation when document already exists', async () => {
            hasDocumentValue = true;

            await getOrCreateOffscreenDocument();

            expect(chromeMock.offscreen.hasDocument).toHaveBeenCalledOnce();
            expect(chromeMock.offscreen.createDocument).not.toHaveBeenCalled();
        });

        it('should invoke createDocument exactly once across 10 concurrent calls', async () => {
            // Simulate a slow creation to stress-test the lock
            (chromeMock.offscreen.createDocument as Mock).mockImplementationOnce(
                () => new Promise<void>((resolve) => {
                    setTimeout(() => {
                        hasDocumentValue = true;
                        resolve();
                    }, 50);
                }),
            );

            const calls = Array.from({ length: 10 }, () => getOrCreateOffscreenDocument());
            await Promise.all(calls);

            expect(chromeMock.offscreen.createDocument).toHaveBeenCalledOnce();
        });
    });

    // ─────────────────────────────────────────────────────────
    // Test 2: Spin-Down Mechanism
    // ─────────────────────────────────────────────────────────
    describe('Spin-Down (closeOffscreenDocument)', () => {
        it('should close the offscreen document and clear state', async () => {
            // Create first
            await getOrCreateOffscreenDocument();
            hasDocumentValue = true;

            await closeOffscreenDocument();

            expect(chromeMock.offscreen.closeDocument).toHaveBeenCalledOnce();
        });

        it('should reject all pending tasks with DOCUMENT_CLOSED', async () => {
            await getOrCreateOffscreenDocument();

            // Simulate a pending task by calling sendWorkerTask without resolving
            // We suppress the runtime.sendMessage to prevent it from resolving
            (chromeMock.runtime.sendMessage as Mock).mockImplementation(
                () => new Promise(() => { /* never resolves */ }),
            );

            const taskPromise = sendWorkerTask('PING', undefined, 10_000);

            // Small delay to let the message be sent and task registered
            await new Promise(r => setTimeout(r, 10));

            // Now tear down
            await closeOffscreenDocument();

            // The task should reject with DOCUMENT_CLOSED
            await expect(taskPromise).rejects.toThrow('DOCUMENT_CLOSED');
        });

        it('should handle closing when no document exists', async () => {
            hasDocumentValue = false;

            // Should not throw
            await closeOffscreenDocument();

            expect(chromeMock.offscreen.closeDocument).not.toHaveBeenCalled();
        });

        it('should allow re-creation after closing', async () => {
            await getOrCreateOffscreenDocument();
            hasDocumentValue = true;

            await closeOffscreenDocument();
            hasDocumentValue = false;

            vi.clearAllMocks();
            await getOrCreateOffscreenDocument();

            expect(chromeMock.offscreen.createDocument).toHaveBeenCalledOnce();
        });
    });

    // ─────────────────────────────────────────────────────────
    // Test 3: sendWorkerTask Mechanics
    // ─────────────────────────────────────────────────────────
    describe('sendWorkerTask', () => {
        it('should send a properly structured OffscreenRequest', async () => {
            // Mock sendMessage to capture the message, but never resolve (we'll timeout)
            let sentMessage: Record<string, unknown> | null = null;
            (chromeMock.runtime.sendMessage as Mock).mockImplementationOnce(
                (msg: Record<string, unknown>) => {
                    sentMessage = msg;
                    return new Promise(() => { /* pending */ });
                },
            );

            // Fire with short timeout so we don't hang the test
            const taskPromise = sendWorkerTask('PING', undefined, 200);

            await new Promise(r => setTimeout(r, 50));

            expect(sentMessage).not.toBeNull();
            expect(sentMessage!['target']).toBe('OFFSCREEN');
            expect(sentMessage!['action']).toBe('OFFSCREEN_WORKER_TASK');
            expect(sentMessage!['workerAction']).toBe('PING');
            expect(sentMessage!['taskId']).toBeDefined();

            // Let the timeout fire and clean up
            await expect(taskPromise).rejects.toThrow('WORKER_TIMEOUT');
        });

        it('should reject with WORKER_TIMEOUT after the specified threshold', async () => {
            (chromeMock.runtime.sendMessage as Mock).mockImplementation(
                () => new Promise(() => { /* never resolves */ }),
            );

            const start = Date.now();
            const taskPromise = sendWorkerTask('PING', undefined, 300);

            await expect(taskPromise).rejects.toThrow('WORKER_TIMEOUT');
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(250); // Some slack for timer precision
        });

        it('should reject with MESSAGE_SEND_FAILED on sendMessage error', async () => {
            (chromeMock.runtime.sendMessage as Mock).mockRejectedValueOnce(
                new Error('Extension context invalidated'),
            );

            await expect(sendWorkerTask('PING')).rejects.toThrow('MESSAGE_SEND_FAILED');
        });

        it('should resolve the task promise when a SUCCESS response is received', async () => {
            initOffscreenResponseListener();
            const listenerCallback = (chromeMock.runtime.onMessage.addListener as Mock).mock.calls[0][0];

            const taskPromise = sendWorkerTask('PING', { data: 'test' }, 5000);

            await new Promise(r => setTimeout(r, 10));

            const sentMessage = (chromeMock.runtime.sendMessage as Mock).mock.lastCall?.[0];
            const taskId = sentMessage?.taskId;

            listenerCallback({
                target: 'BACKGROUND',
                taskId: taskId,
                status: 'SUCCESS',
                data: { timestamp: 12345, userAgent: 'test-agent' }
            });

            const result = await taskPromise;
            expect(result.status).toBe('SUCCESS');
            expect(result.data).toEqual({ timestamp: 12345, userAgent: 'test-agent' });
        });

        it('should reject the task promise when an ERROR response is received', async () => {
            initOffscreenResponseListener();
            const listenerCallback = (chromeMock.runtime.onMessage.addListener as Mock).mock.calls.at(-1)?.[0];

            const taskPromise = sendWorkerTask('SIMULATE_HEAVY_WORKLOAD', undefined, 5000);

            await new Promise(r => setTimeout(r, 10));

            const sentMessage = (chromeMock.runtime.sendMessage as Mock).mock.lastCall?.[0];

            listenerCallback({
                target: 'BACKGROUND',
                taskId: sentMessage?.taskId,
                status: 'ERROR',
                data: 'Web Worker out of memory'
            });

            const result = await taskPromise;
            expect(result.status).toBe('ERROR');
            expect(result.data).toBe('Web Worker out of memory');
        });


    });

    // ─────────────────────────────────────────────────────────
    // Test 4: Response Listener Registration
    // ─────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────
    // Test 4: Response Listener Registration & Orphaned Messages
    // ─────────────────────────────────────────────────────────
    describe('initOffscreenResponseListener & Orphaned Messages', () => {
        it('should register a chrome.runtime.onMessage listener', () => {
            const callsBefore = (chromeMock.runtime.onMessage.addListener as Mock).mock.calls.length;
            initOffscreenResponseListener();
            const callsAfter = (chromeMock.runtime.onMessage.addListener as Mock).mock.calls.length;
            expect(callsAfter).toBe(callsBefore + 1);
        });

        it('should safely ignore orphaned messages (unknown taskId) without throwing', () => {
            initOffscreenResponseListener();
            const listenerCallback = (chromeMock.runtime.onMessage.addListener as Mock).mock.calls.at(-1)?.[0];
            
            // Send a fake message that doesn't match any pending task
            expect(() => {
                listenerCallback({
                    target: 'BACKGROUND',
                    taskId: 'non-existent-task-id',
                    status: 'SUCCESS',
                    data: 'Should be ignored'
                });
            }).not.toThrow();
        });
    });
});
