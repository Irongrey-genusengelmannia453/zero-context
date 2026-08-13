import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// 1. Zod Schemas for Cross-Boundary Messages
// ─────────────────────────────────────────────────────────────

// Emitted directly from Transformers.js progress_callback
export const ModelProgressSchema = z.object({
    type: z.literal('MODEL_PROGRESS'),
    status: z.enum(['initiate', 'downloading', 'progress', 'done', 'ready']),
    file: z.string().optional(),
    name: z.string().optional(),
    progress: z.number().optional(), // Percentage (0-100)
    loaded: z.number().optional(),   // Bytes loaded
    total: z.number().optional(),    // Total bytes
});

// Emitted from the Background worker during chunk processing
export const RedactionProgressSchema = z.object({
    type: z.literal('REDACTION_PROGRESS'),
    chunksProcessed: z.number(),
    totalChunks: z.number(),
});

// Emitted from the Background worker when an offline/network error occurs
export const ModelErrorSchema = z.object({
    type: z.literal('MODEL_ERROR'),
    message: z.string(),
});

// ─────────────────────────────────────────────────────────────
// 2. Extracted Types
// ─────────────────────────────────────────────────────────────

export type ModelProgressMessage = z.infer<typeof ModelProgressSchema>;
export type RedactionProgressMessage = z.infer<typeof RedactionProgressSchema>;
export type ModelErrorMessage = z.infer<typeof ModelErrorSchema>;

/** Messages broadcasted globally from the Background script to active Tabs */
export type ExtensionBroadcastMessage =
    | ModelProgressMessage
    | RedactionProgressMessage
    | ModelErrorMessage;

// ─────────────────────────────────────────────────────────────
// 3. UI State (Strict Discriminated Union)
// ─────────────────────────────────────────────────────────────

export type ToastState =
    | {
          state: 'IDLE';
      }
    | {
          state: 'DOWNLOADING_MODEL';
          progressPercent: number;
          loadedBytes: number;
          totalBytes: number;
      }
    | {
          state: 'REDACTING';
      }
    | {
          state: 'ERROR';
          message: string;
      }
    | {
          state: 'SUCCESS';
          message: string;
      };
