// ─────────────────────────────────────────────────────────────
// Shared message contracts for the 3-tier offscreen pipeline.
// Background Service Worker ⇄ Offscreen Bridge ⇄ Web Worker
// ─────────────────────────────────────────────────────────────

// --- Worker-level message contracts ---

export type WorkerAction = 'PING' | 'SIMULATE_HEAVY_WORKLOAD' | 'PROCESS_TEXT' | 'PREWARM_MODEL';

/** Default timeout thresholds (ms) per worker action. */
export const WORKER_TIMEOUTS: Record<WorkerAction, number> = {
    PING: 3_000,
    SIMULATE_HEAVY_WORKLOAD: 30_000,
    PROCESS_TEXT: 30_000,
    PREWARM_MODEL: 30_000,
};

export interface WorkerRequest {
    action: WorkerAction;
    taskId: string;
    payload?: unknown;
}

export interface WorkerResponse {
    action: WorkerAction;
    taskId: string;
    status: 'SUCCESS' | 'ERROR';
    data: unknown;
    durationMs?: number;
}

// --- Chrome runtime message contracts (Background ⇄ Offscreen) ---

export type OffscreenAction = 'OFFSCREEN_WORKER_TASK';

export interface OffscreenRequest {
    target: 'OFFSCREEN';
    action: OffscreenAction;
    taskId: string;
    workerAction: WorkerAction;
    payload?: unknown;
}

export interface OffscreenResponse {
    status: 'SUCCESS' | 'ERROR';
    taskId: string;
    data: unknown;
    durationMs?: number;
}
