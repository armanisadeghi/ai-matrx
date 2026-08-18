// features/audio/dictationAudioRegistry.ts
//
// THE DICTATION-AUDIO ANNOUNCEMENT CHANNEL — how a surface learns that the
// audio behind a dictation it hosted was durably saved (or that the save
// failed and a retry is available).
//
// WHY. The shared recorder (useChunkedRecordAndTranscribe, mounted once by
// GlobalRecordingEngine) has ALWAYS uploaded every full dictation recording
// through the canonical file handler and persisted a transcripts row — but the
// resulting `cld_files` id never reached the surface the user dictated INTO.
// Surfaces that must link the audio to their own record (vision-interview
// stamps `interview.turn.audio_file_id`; any future surface with an
// audio-provenance column) need that id, keyed by the RecordingOrigin the
// surface declared via `RecordingOriginProvider`.
//
// Framework-free on purpose (same posture as `recordingCommands` /
// `recordingOrigin`): the recorder hook announces here without dragging Redux
// into the audio graph, and a consuming surface subscribes from a React
// effect. Blobs stay OUT of Redux (non-serializable); a failed save keeps its
// blob alive HERE, in memory, behind a `retry()` closure — localStorage
// cannot hold blobs, so in-memory + an honest retry affordance is the
// contract (never-lose doctrine: the chunk-level IndexedDB safety store +
// boot-marker recovery still back this up across a crash).
//
// One recorder → at most one in-flight save → a plain listener set suffices.

import type { RecordingOrigin } from "./recordingOrigin";

export interface SavedDictationAudio {
  /** cld_files UUID — the durable handle (media-durability doctrine). */
  fileId: string;
  origin: RecordingOrigin | null;
  /** Final transcript text of the dictation the audio belongs to. */
  text: string;
  savedAtMs: number;
}

export interface FailedDictationAudio {
  origin: RecordingOrigin | null;
  text: string;
  error: string;
  /**
   * Re-attempt the upload of the SAME in-memory blob. Resolves with the saved
   * record (also announced to every subscriber) or rejects with the new
   * failure (also announced). Callable repeatedly.
   */
  retry: () => Promise<SavedDictationAudio>;
}

export type DictationAudioEvent =
  | { type: "saved"; saved: SavedDictationAudio }
  | { type: "save_failed"; failed: FailedDictationAudio };

type Listener = (event: DictationAudioEvent) => void;

const listeners = new Set<Listener>();

/** Subscribe to dictation-audio save outcomes. Returns an unsubscribe fn. */
export function subscribeDictationAudio(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Recorder-side: the full dictation audio landed in cld_files. */
export function announceDictationAudioSaved(saved: SavedDictationAudio): void {
  for (const l of [...listeners]) {
    try {
      l({ type: "saved", saved });
    } catch (err) {
      // A broken subscriber must never break the recorder's finalize path.
      console.error("[dictation-audio] subscriber threw on saved:", err);
    }
  }
}

/** Recorder-side: the upload failed; the blob stays retryable in memory. */
export function announceDictationAudioSaveFailed(
  failed: FailedDictationAudio,
): void {
  for (const l of [...listeners]) {
    try {
      l({ type: "save_failed", failed });
    } catch (err) {
      console.error("[dictation-audio] subscriber threw on save_failed:", err);
    }
  }
}
