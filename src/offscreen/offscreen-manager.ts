// ─────────────────────────────────────────────────────────────
// Offscreen Document Manager — Singleton lifecycle controller.
// Runs inside the Background Service Worker context.
// ─────────────────────────────────────────────────────────────

import type {
    OffscreenRequest,
    OffscreenResponse,
    WorkerAction,
} from './types';
import { WORKER_TIMEOUTS } from './types';

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

/** In-memory lock to prevent concurrent createDocument() race conditions. */
let creationPromise: Promise<void> | null = null;

/**
 * Ensures exactly one Offscreen Document exists.
 * Concurrent calls share the same pending creation promise.
 */
export async function getOrCreateOffscreenDocument(): Promise<void> {
    // Fast path — document already alive
    const exists = await chrome.offscreen.hasDocument();
    if (exists) return;

    // If a creation is already in-flight, piggyback on it
    if (creationPromise) {
        return creationPromise;
    }

    // Acquire the lock and create
    creationPromise = chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification:
            'Execute heavy background AI/WASM pipelines on isolated CPU threads without blocking the main UI.',
    });

    try {
        await creationPromise;
    } finally {
        // Release the lock regardless of success/failure
        creationPromise = null;
    }
}

/**
 * Tears down the Offscreen Document, flushing the Web Worker and
 * any in-memory AI models from RAM. Rejects all pending tasks.
 */
export async function closeOffscreenDocument(): Promise<void> {
    // Clear the creation lock so future calls can re-create
    creationPromise = null;

    // Reject all pending tasks with a structured error
    for (const [taskId, pending] of pendingTasks) {
        pending.reject(new Error(`DOCUMENT_CLOSED: Task ${taskId} aborted — offscreen document was torn down.`));
    }
    pendingTasks.clear();

    // Tear down the document (and its Worker with it)
    const exists = await chrome.offscreen.hasDocument();
    if (exists) {
        await chrome.offscreen.closeDocument();
    }
}

// ─────────────────────────────────────────────────────────────
// Task tracking for async Worker round-trips
// ─────────────────────────────────────────────────────────────

interface PendingTask {
    resolve: (response: OffscreenResponse) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

const pendingTasks = new Map<string, PendingTask>();

/**
 * Sends a typed task to the Web Worker via the Offscreen Bridge.
 *
 * @param action    - The worker action to execute (PING, SIMULATE_HEAVY_WORKLOAD, etc.)
 * @param payload   - Optional action-specific data
 * @param timeoutMs - Override the default timeout for this action
 * @returns The typed worker response
 */
export async function sendWorkerTask(
    action: WorkerAction,
    payload?: unknown,
    timeoutMs?: number,
): Promise<OffscreenResponse> {
    // Ensure the execution environment is alive
    await getOrCreateOffscreenDocument();

    const taskId = crypto.randomUUID();
    const timeout = timeoutMs ?? WORKER_TIMEOUTS[action];

    const message: OffscreenRequest = {
        target: 'OFFSCREEN',
        action: 'OFFSCREEN_WORKER_TASK',
        taskId,
        workerAction: action,
        payload,
    };

    return new Promise<OffscreenResponse>((resolve, reject) => {
        // Arm the timeout bomb
        const timer = setTimeout(() => {
            pendingTasks.delete(taskId);
            reject(new Error(
                `WORKER_TIMEOUT: Task ${taskId} (${action}) did not respond within ${timeout}ms.`,
            ));
        }, timeout);

        pendingTasks.set(taskId, { resolve, reject, timer });

        // Fire the message to the Offscreen Document (with retry for initialization race condition)
        const sendMessageWithRetry = async (msg: OffscreenRequest, retries = 10): Promise<void> => {
            for (let i = 0; i < retries; i++) {
                try {
                    await chrome.runtime.sendMessage(msg);
                    return; // Success
                } catch (err: any) {
                    if (err.message && err.message.includes('Receiving end does not exist') && i < retries - 1) {
                        // Document created but script hasn't registered listener yet. Wait and retry.
                        await new Promise(r => setTimeout(r, 50));
                    } else {
                        throw err;
                    }
                }
            }
        };

        sendMessageWithRetry(message).catch((err: Error) => {
            clearTimeout(timer);
            pendingTasks.delete(taskId);
            reject(new Error(`MESSAGE_SEND_FAILED: ${err.message}`));
        });
    });
}

/**
 * Listener for responses routed back from the Offscreen Bridge.
 * Must be registered in the Background Service Worker context.
 */
export function initOffscreenResponseListener(): void {
    chrome.runtime.onMessage.addListener((message: OffscreenResponse & { target?: string }) => {
        // Only handle messages explicitly targeted at us from the offscreen bridge
        if (message.target === 'BACKGROUND' && message.taskId) {
            const pending = pendingTasks.get(message.taskId);
            if (pending) {
                clearTimeout(pending.timer);
                pendingTasks.delete(message.taskId);
                pending.resolve(message);
            }
        }
        // Don't return true — this is fire-and-forget from the offscreen side
        return false;
    });
}
