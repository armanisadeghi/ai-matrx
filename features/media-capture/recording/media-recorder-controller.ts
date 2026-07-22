/**
 * features/media-capture/recording/media-recorder-controller.ts
 *
 * THE canonical low-level MediaRecorder state machine — shared by video AND
 * audio (plan §2 locked decision 5). Framework-free: no React, no Redux, no
 * imports beyond the pure capture core. Higher layers (video-recorder.ts, the
 * refactored `useSimpleRecorder`) compose lock/session/mic discipline around
 * it; there is NO second MIME/lifecycle state machine anywhere.
 *
 * Responsibilities:
 * - MIME selection: walk `recordingMimeCandidates(kind, isTypeSupported)` and
 *   CONFIRM each rung by constructing + starting a real MediaRecorder
 *   (`isTypeSupported` is a hint, not a guarantee). All-rungs-fail → typed
 *   `unsupported-codec` terminal error.
 * - MIME authority: `recorder.mimeType` after start and the MIME observed on
 *   emitted Blob data are AUTHORITATIVE; the requested candidate is
 *   diagnostics only (invariant 12).
 * - Lifecycle: start / pause / resume / stop / cancel with explicit terminal
 *   semantics (exactly ONE terminal event per controller, ever).
 * - Elapsed time: monotonic `performance.now()`, pause-aware — NEVER derived
 *   from chunk arrival (`dataavailable` timing is unreliable under tab
 *   suspension / screen lock).
 * - Timeslice chunk emission via `onChunk(blob, sequence)`.
 * - Limit enforcement: max duration (elapsed-based) and estimated size
 *   (emitted bytes + bitrate-extrapolation since the last chunk) — hard stop
 *   with a distinct terminal reason when exceeded.
 */

import {
  recordingMimeCandidates,
  type RecordingKind,
} from "@/features/media-capture/core/mime-selection";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecorderControllerState =
  | "idle"
  | "recording"
  | "paused"
  | "stopping"
  | "ended";

/** Why the controller reached its terminal state. Every reason is explicit —
 *  a consumer can always tell the user exactly what ended the recording. */
export type RecorderTerminalReason =
  | "stopped" // graceful stop() — chunks are complete and trustworthy
  | "cancelled" // cancel() — the recording is a DISCARD; no delivery
  | "max-duration" // hard stop: elapsed hit maxDurationMs
  | "max-bytes" // hard stop: estimated size hit maxBytes
  | "unsupported-codec" // every ladder rung failed construction/start
  | "recorder-error"; // MediaRecorder fired an error mid-recording

export interface RecorderTerminal {
  reason: RecorderTerminalReason;
  /** Underlying error for unsupported-codec / recorder-error. */
  error?: Error;
  /** Pause-aware elapsed recording time at terminal. */
  elapsedMs: number;
  /** Total bytes emitted through onChunk. */
  emittedBytes: number;
  /** Authoritative MIME (recorder.mimeType, refined by emitted Blob type). */
  mime: string | null;
}

/** Typed all-rungs-failed error (terminal `unsupported-codec`). */
export class UnsupportedCodecError extends Error {
  constructor(kind: RecordingKind, attempts: Array<string | null>) {
    super(
      `[media-recorder-controller] no ${kind} recording format could be started. ` +
        `Tried (construct+start confirmed): ${attempts
          .map((a) => a ?? "<browser default>")
          .join(", ")}. Recording is not supported in this environment.`,
    );
    this.name = "UnsupportedCodecError";
  }
}

export interface MediaRecorderControllerOptions {
  stream: MediaStream;
  kind: RecordingKind;
  /** Timeslice for chunk emission. Default 1000ms. */
  timesliceMs?: number;
  /** Hard cap on pause-aware elapsed time. */
  maxDurationMs?: number;
  /** Hard cap on estimated output size (emitted + bitrate extrapolation). */
  maxBytes?: number;
  /** Every emitted chunk, in order, with a monotonically increasing sequence. */
  onChunk: (chunk: Blob, sequence: number) => void;
  /** Fired exactly once, on ANY terminal path. */
  onTerminal: (terminal: RecorderTerminal) => void;
  // ── Dependency injection (tests / non-browser callers) ──
  isTypeSupported?: (type: string) => boolean;
  createRecorder?: (
    stream: MediaStream,
    options?: MediaRecorderOptions,
  ) => MediaRecorder;
  now?: () => number;
  /** Limit-check interval. Default 250ms. */
  limitCheckIntervalMs?: number;
}

export interface MediaRecorderController {
  /** Confirm a format (ladder fallthrough) and start recording. Resolves with
   *  the requested candidate (diagnostics) + the recorder-reported MIME
   *  (authoritative until refined by emitted Blob types). Rejects with
   *  `UnsupportedCodecError` after firing the terminal event. */
  start(): Promise<{ requestedMime: string | null; recorderMime: string | null }>;
  pause(): void;
  resume(): void;
  /** Graceful stop — flushes the final chunk(s), then fires terminal
   *  "stopped" (or the pending limit reason). Idempotent. */
  stop(): void;
  /** Discard — stops capture immediately and fires terminal "cancelled".
   *  Consumers must NOT deliver any partial output. Idempotent. */
  cancel(): void;
  /** Pause-aware monotonic elapsed recording time. */
  getElapsedMs(): number;
  getEmittedBytes(): number;
  /** Projected final size — emitted bytes plus bitrate extrapolation over the
   *  interval since the last chunk. This is the SAME number `maxBytes`
   *  enforcement uses, so a size gauge fed from it can never disagree with the
   *  hard stop the user is about to hit. */
  getEstimatedBytes(): number;
  getState(): RecorderControllerState;
  /** Authoritative output MIME: emitted Blob type when non-empty, else
   *  `recorder.mimeType`, else the confirmed requested candidate. */
  getAuthoritativeMime(): string | null;
}

// ─── Implementation ──────────────────────────────────────────────────────────

const DEFAULT_TIMESLICE_MS = 1000;
const DEFAULT_LIMIT_CHECK_MS = 250;

export function createMediaRecorderController(
  opts: MediaRecorderControllerOptions,
): MediaRecorderController {
  const now = opts.now ?? (() => performance.now());
  const timeslice = opts.timesliceMs ?? DEFAULT_TIMESLICE_MS;
  const isTypeSupported =
    opts.isTypeSupported ??
    ((t: string) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
  const createRecorder =
    opts.createRecorder ??
    ((stream: MediaStream, options?: MediaRecorderOptions) =>
      new MediaRecorder(stream, options));

  let state: RecorderControllerState = "idle";
  let recorder: MediaRecorder | null = null;
  let requestedMime: string | null = null;
  let recorderMime: string | null = null;
  /** MIME observed on emitted Blob data — the strongest authority. */
  let emittedMime: string | null = null;

  let sequence = 0;
  let emittedBytes = 0;

  // Pause-aware monotonic clock.
  let startedAt = 0;
  let pausedAccumMs = 0;
  let pausedAt: number | null = null;

  let limitTimer: ReturnType<typeof setInterval> | null = null;
  /** Set when a limit tripped the stop, so onstop reports the right reason. */
  let pendingReason: RecorderTerminalReason | null = null;
  let terminalFired = false;
  /** True on cancel(): suppress chunk delivery for data flushed after discard. */
  let discarding = false;

  function elapsedMs(): number {
    if (state === "idle") return 0;
    const end = pausedAt ?? (state === "ended" ? lastElapsedSnapshot : now());
    return Math.max(0, end - startedAt - pausedAccumMs);
  }
  let lastElapsedSnapshot = 0;

  function authoritativeMime(): string | null {
    return emittedMime ?? recorderMime ?? requestedMime;
  }

  function clearLimitTimer(): void {
    if (limitTimer) {
      clearInterval(limitTimer);
      limitTimer = null;
    }
  }

  function fireTerminal(reason: RecorderTerminalReason, error?: Error): void {
    if (terminalFired) return;
    terminalFired = true;
    lastElapsedSnapshot = pausedAt ?? now();
    const finalElapsed = elapsedMs();
    state = "ended";
    clearLimitTimer();
    try {
      opts.onTerminal({
        reason,
        ...(error ? { error } : {}),
        elapsedMs: finalElapsed,
        emittedBytes,
        mime: authoritativeMime(),
      });
    } catch (err) {
      console.error("[media-recorder-controller] onTerminal threw:", err);
    }
  }

  /** Estimated final size: bytes already emitted + bitrate extrapolation over
   *  the interval since those bytes were emitted (chunks lag real time). */
  function estimatedBytes(): number {
    const el = elapsedMs();
    if (el <= 0 || emittedBytes === 0) return emittedBytes;
    const sinceLastChunkMs = Math.max(0, el - lastChunkElapsedMs);
    const bytesPerMs = emittedBytes / Math.max(1, lastChunkElapsedMs);
    return emittedBytes + bytesPerMs * sinceLastChunkMs;
  }
  let lastChunkElapsedMs = 0;

  function enforceLimits(): void {
    if (state !== "recording") return;
    if (opts.maxDurationMs !== undefined && elapsedMs() >= opts.maxDurationMs) {
      hardStop("max-duration");
      return;
    }
    if (opts.maxBytes !== undefined && estimatedBytes() >= opts.maxBytes) {
      hardStop("max-bytes");
    }
  }

  function hardStop(reason: RecorderTerminalReason): void {
    if (state === "ended" || state === "stopping") return;
    pendingReason = reason;
    state = "stopping";
    clearLimitTimer();
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (err) {
        fireTerminal(
          reason,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    } else {
      fireTerminal(reason);
    }
  }

  function wireRecorder(mr: MediaRecorder): void {
    mr.ondataavailable = (event: BlobEvent) => {
      if (discarding) return;
      if (event.data && event.data.size > 0) {
        if (!emittedMime && event.data.type) {
          emittedMime = event.data.type;
        }
        emittedBytes += event.data.size;
        lastChunkElapsedMs = elapsedMs();
        const seq = sequence++;
        try {
          opts.onChunk(event.data, seq);
        } catch (err) {
          console.error("[media-recorder-controller] onChunk threw:", err);
        }
      }
      // Size enforcement also runs on real chunk arrival (tightest signal).
      enforceLimits();
    };
    mr.onstop = () => {
      fireTerminal(pendingReason ?? "stopped");
    };
    mr.onerror = (event: Event) => {
      const raw = (event as { error?: unknown }).error;
      const err =
        raw instanceof Error ? raw : new Error("MediaRecorder error");
      // Stop capture; onstop may or may not follow, so fire terminal directly.
      try {
        if (mr.state !== "inactive") mr.stop();
      } catch {
        // ignore — already dead
      }
      fireTerminal("recorder-error", err);
    };
  }

  return {
    async start() {
      if (state !== "idle") {
        throw new Error(
          `[media-recorder-controller] start() called in state "${state}" — a controller records exactly once.`,
        );
      }
      const candidates = recordingMimeCandidates(opts.kind, isTypeSupported);
      const attempted: Array<string | null> = [];
      for (const candidate of candidates) {
        attempted.push(candidate);
        let mr: MediaRecorder;
        try {
          mr = createRecorder(
            opts.stream,
            candidate !== null ? { mimeType: candidate } : undefined,
          );
          wireRecorder(mr);
          mr.start(timeslice);
        } catch (err) {
          // This rung failed construction or start — fall through to the next.
          console.warn(
            `[media-recorder-controller] format rung failed (${candidate ?? "<browser default>"}):`,
            err,
          );
          continue;
        }
        recorder = mr;
        requestedMime = candidate;
        recorderMime = mr.mimeType && mr.mimeType.length > 0 ? mr.mimeType : null;
        state = "recording";
        startedAt = now();
        pausedAccumMs = 0;
        pausedAt = null;
        limitTimer = setInterval(
          enforceLimits,
          opts.limitCheckIntervalMs ?? DEFAULT_LIMIT_CHECK_MS,
        );
        return { requestedMime, recorderMime };
      }
      const error = new UnsupportedCodecError(opts.kind, attempted);
      fireTerminal("unsupported-codec", error);
      throw error;
    },

    pause() {
      if (state !== "recording" || !recorder) return;
      try {
        recorder.pause();
      } catch (err) {
        console.error("[media-recorder-controller] pause() failed:", err);
        return;
      }
      pausedAt = now();
      state = "paused";
    },

    resume() {
      if (state !== "paused" || !recorder) return;
      try {
        recorder.resume();
      } catch (err) {
        console.error("[media-recorder-controller] resume() failed:", err);
        return;
      }
      if (pausedAt !== null) {
        pausedAccumMs += now() - pausedAt;
        pausedAt = null;
      }
      state = "recording";
    },

    stop() {
      if (state === "idle") {
        fireTerminal("stopped");
        return;
      }
      hardStop(pendingReason ?? "stopped");
    },

    cancel() {
      if (state === "ended") return;
      discarding = true;
      pendingReason = "cancelled";
      state = "stopping";
      clearLimitTimer();
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore — fall through to terminal
        }
      }
      // Terminal fires via onstop when the recorder was live; fire directly
      // otherwise (idempotent either way).
      if (!recorder || recorder.state === "inactive") {
        fireTerminal("cancelled");
      }
    },

    getElapsedMs: () => elapsedMs(),
    getEmittedBytes: () => emittedBytes,
    getEstimatedBytes: () => estimatedBytes(),
    getState: () => state,
    getAuthoritativeMime: () => authoritativeMime(),
  };
}
