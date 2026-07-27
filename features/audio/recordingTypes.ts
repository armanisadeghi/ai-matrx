/**
 * Shared types for the global recording system.
 *
 * Extracted from `providers/GlobalRecordingProvider.tsx` so light modules
 * (the command proxy, the context-free `useGlobalRecording` hook, consumers)
 * can reference the API shape without importing the heavy recording engine.
 * Everything here is `import type` — erased at compile, zero graph weight.
 */

import type { ChunkCompleteInfo } from "@/features/audio/hooks/useChunkedRecordAndTranscribe";
import type { TranscriptionResult } from "@/features/audio/types";
import type { RecordingContext } from "@/lib/redux/slices/recordingsSlice";

export type { ChunkCompleteInfo, TranscriptionResult, RecordingContext };

export interface StartRecordingArgs {
  context: RecordingContext;
  /** Per-chunk timing + text. Fires for every successful chunk transcription. */
  onChunkComplete?: (info: ChunkCompleteInfo) => void;
  /** Final accumulated text + status when the recording stops. */
  onComplete?: (result: TranscriptionResult, audioBlob?: Blob | null) => void;
  /** Failed chunk index + error message (transcription failures, not capture failures). */
  onChunkError?: (chunkIndex: number, error: string) => void;
  /** Capture-level errors — e.g. permission denied. */
  onError?: (message: string, code?: string) => void;
}

export interface GlobalRecordingApi {
  /** True iff a recording is currently active (recording or paused). */
  isActive: boolean;
  /**
   * True between `stop()` and the moment the final transcript/finalize callback
   * fires. A new recording MUST NOT start during this window — the recorder is a
   * single shared instance and starting again would reset the refs the pending
   * finalization depends on, stranding the previous recording forever.
   */
  isFinalizing: boolean;
  /** Active recording context, or null when idle. */
  context: RecordingContext | null;
  start: (args: StartRecordingArgs) => Promise<void>;
  stop: () => void;
  /**
   * Discard the active recording: stops capture and finalizes the audio safely
   * (no IndexedDB orphan) but does NOT deliver the transcript to the
   * subscriber. Used by "cancel" affordances so a cancelled recording never
   * leaks text into the host field.
   */
  cancel: () => void;
  pause: () => void;
  resume: () => void;
}

/**
 * The imperative surface the recording ENGINE registers with the command proxy
 * (`features/audio/recordingCommands.ts`) once it mounts inside the lazy
 * audio system. Identical verbs to `GlobalRecordingApi`, state excluded —
 * state lives in `recordingsSlice`.
 */
export interface GlobalRecordingCommands {
  start: (args: StartRecordingArgs) => Promise<void>;
  stop: () => void;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
}
