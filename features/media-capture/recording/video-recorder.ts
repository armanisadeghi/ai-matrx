/**
 * features/media-capture/recording/video-recorder.ts
 *
 * Framework-free recording orchestrators over the canonical
 * `media-recorder-controller`:
 *
 * - `startVideoRecording` — a pinned camera lease + (optionally) ONE clone of
 *   the shared mic track composed into a recording stream.
 * - `startAudioRecording` — audio-only through the SAME engine and the same
 *   mic discipline (this is NOT a parallel recorder — the controller and the
 *   journal are shared).
 *
 * Mic discipline (plan §5 invariant 3), enforced on EVERY exit path:
 *   acquireMicStream() exactly ONCE → clone the audio track into the composed
 *   stream → on exit stop ONLY the clone → releaseMicStream() exactly once
 *   (double-release guarded).
 *
 * Capture lock (invariant 2): `claimCapture({id: "media-capture-recording"})`
 * before the recorder starts. A takeover is a DISCARD — the journal is
 * discarded and no partial blob is ever delivered.
 *
 * Journal: every controller chunk lands in the chunk journal (single source
 * of truth for bytes); the final Blob is assembled FROM THE JOURNAL. Terminal
 * environment events (track ended / device removed / pagehide) stop the
 * recorder and PRESERVE the journal for the recovery flow.
 */

import {
  claimCapture,
  releaseCapture,
} from "@/features/audio/captureLock";
import {
  acquireMicStream,
  releaseMicStream,
  subscribeMicInterruption,
} from "@/features/audio/micStream";
import { beginRecordingSession } from "@/features/audio/session/audioSessionRegistry";
import type { PlaybackSessionHandle } from "@/features/audio/session/types";
import {
  pinForRecording,
  subscribeCameraInterruption,
  unpin,
  type CameraLease,
} from "@/features/media-capture/runtime/camera-stream-manager";
import {
  createMediaRecorderController,
  type RecorderControllerState,
  type RecorderTerminal,
  type RecorderTerminalReason,
} from "@/features/media-capture/recording/media-recorder-controller";
import {
  appendChunk,
  createJournal,
  discardJournal,
  finalizeJournal,
  readChunks,
} from "@/features/media-capture/recording/chunk-journal";
import type { RecordingKind } from "@/features/media-capture/core/mime-selection";
import { registerLiveCapture } from "@/features/media-capture/runtime/mediaCaptureDiagnostics";

/** The one capture-lock id for studio recordings (video AND audio modes). */
export const MEDIA_CAPTURE_LOCK_ID = "media-capture-recording";

export type RecordingEndReason =
  | RecorderTerminalReason
  | "takeover" // captureLock takeover → discard
  | "environment"; // track ended / device removed / pagehide → stop + preserve

export interface CaptureRecordingResult {
  blob: Blob;
  /** Authoritative MIME — from the emitted Blob data / recorder. */
  mime: string;
  durationMs: number;
  hasAudio: boolean;
  captureId: string;
  /** True when chunks were lost or the stop was environmental — the caller
   *  must surface "recovered N of M" phrasing, never present it as whole. */
  partial: boolean;
}

export interface CaptureRecordingHandle {
  captureId: string;
  pause(): void;
  resume(): void;
  /** Graceful stop → assembled result from the journal. */
  stop(): Promise<CaptureRecordingResult>;
  /** Discard — journal dropped, nothing delivered. */
  cancel(): Promise<void>;
  getElapsedMs(): number;
  /** Projected final size (same number the `maxBytes` hard stop uses). */
  getEstimatedBytes(): number;
  /**
   * The COMPOSED recording stream (camera track + mic clone, or the mic clone
   * alone), for read-only observation — the HUD's level meter taps this so it
   * meters exactly what is being recorded.
   *
   * Read-only by contract: callers must never stop, remove, or clone tracks
   * from it. The engine's teardown owns every track's lifetime (invariant 3 —
   * the mic clone is stopped exactly once, on the engine's exit path).
   */
  getRecordingStream(): MediaStream;
  getState(): RecorderControllerState;
  /** Resolves on ANY terminal: result on delivery paths, null on discard
   *  (cancel/takeover). Rejects only on unrecoverable internal errors. */
  done: Promise<CaptureRecordingResult | null>;
  endReason(): RecordingEndReason | null;
}

interface EngineArgs {
  kind: RecordingKind;
  buildStream: () => Promise<{
    stream: MediaStream;
    hasAudio: boolean;
    /** Per-path teardown (stop clones, release mic/pin) — runs EXACTLY once. */
    teardown: () => void;
  }>;
  label: string;
  sourceFeature: string;
  maxDurationMs?: number;
  maxBytes?: number;
  onAutoStopped?: (reason: RecordingEndReason) => void;
}

async function startEngine(args: EngineArgs): Promise<CaptureRecordingHandle> {
  const captureId = `cap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const built = await args.buildStream();
  let tornDown = false;
  const teardownOnce = (): void => {
    if (tornDown) return;
    tornDown = true;
    try {
      built.teardown();
    } catch (err) {
      console.error("[video-recorder] teardown threw:", err);
    }
  };

  let endReason: RecordingEndReason | null = null;
  let discarded = false;
  let session: PlaybackSessionHandle | null = null;
  /** Unregisters the diagnostics live-capture entry — runs on every terminal. */
  let unregisterLive: (() => void) | null = null;
  const unsubscribers: Array<() => void> = [];

  let resolveDone!: (r: CaptureRecordingResult | null) => void;
  let rejectDone!: (e: unknown) => void;
  const done = new Promise<CaptureRecordingResult | null>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  const journalWrites: Array<Promise<void>> = [];

  const finish = async (terminal: RecorderTerminal): Promise<void> => {
    teardownOnce();
    // Every terminal path funnels through here, so this is the ONE place the
    // live-capture diagnostics entry is cleared — no path can leak it.
    unregisterLive?.();
    unregisterLive = null;
    for (const u of unsubscribers.splice(0)) u();
    releaseCapture(MEDIA_CAPTURE_LOCK_ID);
    try {
      // Wait for every journal append to land before reading back.
      await Promise.allSettled(journalWrites);
      if (discarded || terminal.reason === "cancelled") {
        await discardJournal(captureId);
        session?.end("done");
        resolveDone(null);
        return;
      }
      if (
        terminal.reason === "unsupported-codec" ||
        terminal.reason === "recorder-error"
      ) {
        // Preserve whatever was emitted for recovery; surface the error.
        session?.end("error", terminal.error?.message);
        rejectDone(terminal.error ?? new Error(terminal.reason));
        return;
      }
      await finalizeJournal(captureId, terminal.mime);
      const read = await readChunks(captureId);
      if (read.chunks.length === 0) {
        session?.end("error", "No media data was emitted before the recording ended.");
        rejectDone(
          new Error(
            "[video-recorder] recording ended with zero emitted chunks — nothing to deliver.",
          ),
        );
        return;
      }
      const mime =
        terminal.mime ?? read.manifest.mime ?? read.chunks[0].type ?? "";
      const blob = new Blob(read.chunks, mime ? { type: mime } : undefined);
      const partial =
        read.missingSequences.length > 0 || endReason === "environment";
      session?.end("done");
      resolveDone({
        blob,
        mime: blob.type || mime,
        durationMs: Math.round(terminal.elapsedMs),
        hasAudio: built.hasAudio,
        captureId,
        partial,
      });
    } catch (err) {
      session?.end("error", err instanceof Error ? err.message : String(err));
      rejectDone(err);
    }
  };

  const controller = createMediaRecorderController({
    stream: built.stream,
    kind: args.kind,
    maxDurationMs: args.maxDurationMs,
    maxBytes: args.maxBytes,
    onChunk: (chunk, sequence) => {
      const write = appendChunk(captureId, sequence, chunk).catch((err) => {
        console.error(
          `[video-recorder] journal append failed for chunk ${sequence}:`,
          err,
        );
      });
      journalWrites.push(write);
    },
    onTerminal: (terminal) => {
      if (endReason === null) endReason = terminal.reason;
      if (
        endReason !== "stopped" &&
        endReason !== "cancelled" &&
        args.onAutoStopped
      ) {
        args.onAutoStopped(endReason);
      }
      void finish(terminal);
    },
  });

  // Quota preflight + manifest BEFORE the lock claim / recorder start —
  // rejecting here means nothing to unwind but the stream teardown.
  try {
    await createJournal(captureId, {
      mime: null,
      sourceFeature: args.sourceFeature,
      hasAudio: built.hasAudio,
      expectedBytes: args.maxBytes ?? 0,
    });
  } catch (err) {
    teardownOnce();
    throw err;
  }

  // App-wide single-capture arbitration. Takeover = DISCARD.
  claimCapture({
    id: MEDIA_CAPTURE_LOCK_ID,
    label: args.label,
    stop: () => {
      discarded = true;
      endReason = "takeover";
      controller.cancel();
    },
  });

  // Environment exits: stop-and-PRESERVE the journal for recovery.
  const environmentStop = (why: string): void => {
    if (controller.getState() === "ended") return;
    console.error(`[video-recorder] environment stop: ${why} — preserving journal.`);
    endReason = "environment";
    controller.stop();
  };
  if (args.kind === "video") {
    unsubscribers.push(
      subscribeCameraInterruption((reason) => {
        if (reason === "ended" || reason === "permission-revoked") {
          environmentStop(`camera ${reason}`);
        }
      }),
    );
  }
  if (built.hasAudio) {
    unsubscribers.push(
      subscribeMicInterruption((reason) => {
        if (reason === "ended" || reason === "permission-revoked") {
          environmentStop(`mic ${reason}`);
        }
      }),
    );
  }
  if (typeof window !== "undefined") {
    // pagehide is a REAL exit (navigation/close/bfcache): stop + preserve.
    // A merely-hidden tab is NOT terminal — the 1s timeslice cadence already
    // bounds journal loss under OS suspension, so visibilitychange needs no
    // handler here.
    const onPageHide = (): void => environmentStop("pagehide");
    window.addEventListener("pagehide", onPageHide);
    unsubscribers.push(() => window.removeEventListener("pagehide", onPageHide));
  }

  try {
    await controller.start();
  } catch (err) {
    // Terminal already fired (unsupported-codec) → finish() ran teardown +
    // lock release, and `done` rejects. Nobody holds the handle on this path,
    // so swallow the duplicate rejection and drop the empty journal.
    done.catch(() => undefined);
    await discardJournal(captureId).catch(() => undefined);
    throw err;
  }

  session = beginRecordingSession({
    source: "media-capture",
    medium: args.kind === "video" ? "video" : "audio",
    label: args.label,
    controls: {
      pause: () => controller.pause(),
      resume: () => controller.resume(),
      stop: () => controller.stop(),
    },
  });

  // Publish the live capture so the Media window's Camera tab can show the
  // real, pause-aware clock without holding this handle. Cleared in finish().
  unregisterLive = registerLiveCapture(
    {
      captureId,
      kind: args.kind,
      label: args.label,
      sourceFeature: args.sourceFeature,
      startedAt: Date.now(),
    },
    {
      getElapsedMs: () => controller.getElapsedMs(),
      getState: () => controller.getState(),
    },
  );

  return {
    captureId,
    pause: () => controller.pause(),
    resume: () => controller.resume(),
    stop: async () => {
      controller.stop();
      const result = await done;
      if (!result) {
        throw new Error(
          "[video-recorder] stop() resolved with no result — the recording was discarded by a takeover.",
        );
      }
      return result;
    },
    cancel: async () => {
      discarded = true;
      if (endReason === null) endReason = "cancelled";
      controller.cancel();
      await done;
    },
    getElapsedMs: () => controller.getElapsedMs(),
    getEstimatedBytes: () => controller.getEstimatedBytes(),
    getRecordingStream: () => built.stream,
    getState: () => controller.getState(),
    done,
    endReason: () => endReason,
  };
}

// ─── Video ───────────────────────────────────────────────────────────────────

export interface VideoRecordingOptions {
  lease: CameraLease;
  withMic: boolean;
  maxDurationMs?: number;
  maxBytes?: number;
  /** metadata.capture.source_feature; also the session/pin label context. */
  sourceFeature?: string;
  label?: string;
  /** Fired when the recording stopped without an explicit user stop/cancel
   *  (limits or environment) so the UI can explain why. */
  onAutoStopped?: (reason: RecordingEndReason) => void;
}

/**
 * Record the pinned camera lease (+ optional mic clone) to ONE video file.
 * The lease stays owned by the caller — this pins it for the duration and
 * unpins on every exit; it never releases the lease itself.
 */
export async function startVideoRecording(
  opts: VideoRecordingOptions,
): Promise<CaptureRecordingHandle> {
  const label = opts.label ?? "Camera recording";
  return startEngine({
    kind: "video",
    label,
    sourceFeature: opts.sourceFeature ?? "camera",
    maxDurationMs: opts.maxDurationMs,
    maxBytes: opts.maxBytes,
    onAutoStopped: opts.onAutoStopped,
    buildStream: async () => {
      pinForRecording(opts.lease.id, label);
      const videoTrack = opts.lease.stream.getVideoTracks()[0];
      if (!videoTrack) {
        unpin();
        throw new Error("[video-recorder] camera lease has no live video track.");
      }

      let micHeld = false;
      let audioClone: MediaStreamTrack | null = null;
      try {
        const tracks: MediaStreamTrack[] = [videoTrack];
        if (opts.withMic) {
          // Acquire the SHARED mic ONCE; record a CLONE of its track so
          // stopping our recording can never kill other holders.
          const micStream = await acquireMicStream();
          micHeld = true;
          const micTrack = micStream.getAudioTracks()[0];
          if (!micTrack) {
            throw new Error("[video-recorder] shared mic stream has no audio track.");
          }
          audioClone = micTrack.clone();
          tracks.push(audioClone);
        }
        const composed = new MediaStream(tracks);
        return {
          stream: composed,
          hasAudio: opts.withMic,
          teardown: () => {
            // Stop ONLY the clone — never the shared mic track, never the
            // camera track (the lease owns it).
            if (audioClone) {
              try {
                audioClone.stop();
              } catch {
                // ignore
              }
              audioClone = null;
            }
            if (micHeld) {
              releaseMicStream();
              micHeld = false; // double-release guard
            }
            unpin();
          },
        };
      } catch (err) {
        if (audioClone) {
          try {
            (audioClone as MediaStreamTrack).stop();
          } catch {
            // ignore
          }
        }
        if (micHeld) releaseMicStream();
        unpin();
        throw err;
      }
    },
  });
}

// ─── Audio-only ──────────────────────────────────────────────────────────────

export interface AudioRecordingOptions {
  maxDurationMs?: number;
  maxBytes?: number;
  sourceFeature?: string;
  label?: string;
  onAutoStopped?: (reason: RecordingEndReason) => void;
}

/**
 * Audio-only studio recording — same engine, same journal, same mic
 * discipline (shared mic acquired once, CLONE recorded, clone stopped +
 * released exactly once on every exit path).
 */
export async function startAudioRecording(
  opts: AudioRecordingOptions = {},
): Promise<CaptureRecordingHandle> {
  const label = opts.label ?? "Audio recording";
  return startEngine({
    kind: "audio",
    label,
    sourceFeature: opts.sourceFeature ?? "camera",
    maxDurationMs: opts.maxDurationMs,
    maxBytes: opts.maxBytes,
    onAutoStopped: opts.onAutoStopped,
    buildStream: async () => {
      let micHeld = false;
      let audioClone: MediaStreamTrack | null = null;
      try {
        const micStream = await acquireMicStream();
        micHeld = true;
        const micTrack = micStream.getAudioTracks()[0];
        if (!micTrack) {
          throw new Error("[video-recorder] shared mic stream has no audio track.");
        }
        audioClone = micTrack.clone();
        return {
          stream: new MediaStream([audioClone]),
          hasAudio: true,
          teardown: () => {
            if (audioClone) {
              try {
                audioClone.stop();
              } catch {
                // ignore
              }
              audioClone = null;
            }
            if (micHeld) {
              releaseMicStream();
              micHeld = false;
            }
          },
        };
      } catch (err) {
        if (audioClone) {
          try {
            (audioClone as MediaStreamTrack).stop();
          } catch {
            // ignore
          }
        }
        if (micHeld) releaseMicStream();
        throw err;
      }
    },
  });
}
