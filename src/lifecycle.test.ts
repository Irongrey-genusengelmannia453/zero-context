import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock chrome API globally
const mockTabsOnActivatedAddListener = vi.fn();
const mockTabsOnUpdatedAddListener = vi.fn();
const mockTabsGet = vi.fn();
const mockOffscreenCloseDocument = vi.fn();
const mockOffscreenHasDocument = vi.fn();
const mockRuntimeSendMessage = vi.fn();
const mockAlarmsCreate = vi.fn();
const mockAlarmsClear = vi.fn().mockResolvedValue(undefined);
const mockAlarmsOnAlarmAddListener = vi.fn();

global.chrome = {
    tabs: {
        onActivated: { addListener: mockTabsOnActivatedAddListener },
        onUpdated: { addListener: mockTabsOnUpdatedAddListener },
        onRemoved: { addListener: vi.fn() },
        get: mockTabsGet,
        query: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
    },
    offscreen: {
        closeDocument: mockOffscreenCloseDocument,
        hasDocument: mockOffscreenHasDocument,
    },
    alarms: {
        create: mockAlarmsCreate,
        clear: mockAlarmsClear,
        onAlarm: { addListener: mockAlarmsOnAlarmAddListener },
    },
    runtime: {
        onMessage: { addListener: vi.fn() },
        onInstalled: { addListener: vi.fn() },
        sendMessage: mockRuntimeSendMessage,
        getURL: vi.fn().mockReturnValue('mock-url'),
    },
    storage: {
        sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
        local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
        session: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() },
    }
} as any;

// Mock dependencies of background.ts to prevent side-effects during tests
vi.mock('./vault', () => ({
    VaultManager: class {
        clearTab = vi.fn().mockResolvedValue(undefined);
        ensureHydrated = vi.fn().mockResolvedValue(undefined);
        unredactText = vi.fn();
    }
}));
vi.mock('./domainGatekeeper', () => ({
    DomainGatekeeper: class {
        initialize = vi.fn().mockResolvedValue(undefined);
        isUrlAllowed = vi.fn().mockImplementation(async (url: string) => url && url.includes('chatgpt.com'));
    }
}));
vi.mock('./offscreen/offscreen-manager', () => ({
    sendWorkerTask: vi.fn().mockResolvedValue(undefined),
    closeOffscreenDocument: vi.fn().mockResolvedValue(undefined),
    initOffscreenResponseListener: vi.fn(),
}));
vi.mock('./regexEngine', () => ({ redactText: vi.fn() }));
vi.mock('./lexer', () => ({ extractTextForML: vi.fn() }));
vi.mock('./nerProcessor', () => ({ processNerResults: vi.fn() }));

describe('Smart Lifecycle Management (Red Phase)', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        
        // Dynamically import background to trigger listener registrations
        await import('./background');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetModules(); // Ensure a fresh background.ts for other tests if needed
    });

    it('Scenario A: User switches TO an AI Domain -> Prewarms model and clears teardown', async () => {
        // Wait for import to settle
        await new Promise(resolve => process.nextTick(resolve));
        
        // Find the onUpdated listener registered by background.ts
        const onUpdatedCalls = mockTabsOnUpdatedAddListener.mock.calls;
        expect(onUpdatedCalls.length).toBeGreaterThan(0);
        const onUpdatedCallback = onUpdatedCalls[0][0];
        
        mockOffscreenHasDocument.mockResolvedValue(false);
        
        console.log("Simulating onUpdated...");
        // Simulate navigation to an AI domain
        await onUpdatedCallback(1, { url: 'https://chatgpt.com/' }, { id: 1, url: 'https://chatgpt.com/', active: true });

        console.log("Flushing microtasks...");
        // Allow microtasks (Promises) to flush
        await vi.runAllTimersAsync();

        console.log("Checking expectations...");
        // 1. Checks chrome.offscreen.hasDocument()
        expect(mockOffscreenHasDocument).toHaveBeenCalled();
        
        // 2. Dispatch PREWARM_MODEL via sendWorkerTask
        const { sendWorkerTask } = await import('./offscreen/offscreen-manager');
        expect(sendWorkerTask).toHaveBeenCalledWith('PREWARM_MODEL');
        
        expect(mockAlarmsClear).toHaveBeenCalledWith('TEARDOWN_MODEL');
    });

    it('Scenario B: User switches AWAY from an AI Domain -> Starts 5 min teardown timer', async () => {
        await new Promise(resolve => process.nextTick(resolve));
        const onUpdatedCalls = mockTabsOnUpdatedAddListener.mock.calls;
        const onUpdatedCallback = onUpdatedCalls[0][0];

        mockOffscreenHasDocument.mockResolvedValue(true);
        
        // Simulate navigation away from AI domain
        await onUpdatedCallback(1, { url: 'https://github.com' }, { id: 1, url: 'https://github.com', active: true });

        await vi.runAllTimersAsync();

        // Assert alarm is created
        expect(mockAlarmsCreate).toHaveBeenCalledWith('TEARDOWN_MODEL', { delayInMinutes: 5 });

        // Trigger the alarm manually
        const alarmCallback = mockAlarmsOnAlarmAddListener.mock.calls[0][0];
        await alarmCallback({ name: 'TEARDOWN_MODEL' });

        // Assert closeDocument is called
        const { closeOffscreenDocument } = await import('./offscreen/offscreen-manager');
        expect(closeOffscreenDocument).toHaveBeenCalled();
    });
});
