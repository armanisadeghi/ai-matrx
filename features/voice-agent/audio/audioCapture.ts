// features/voice-agent/audio/audioCapture.ts
//
// Microphone capture pipeline for xAI Realtime.
//
// Lifecycle:
//   1. `warmupSync()` — called SYNCHRONOUSLY inside the click handler (Safari).
//      Creates / resumes the capture AudioContext at 24kHz. No await.
//   2. `start()` — async. Requests mic permission, registers the AudioWorklet,
//      wires the worklet into the graph. PCM frames flow into either the
//      pre-connect buffer or the live `onFrame` callback.
//   3. `setLive(onFrame)` — called when `session.updated` is acknowledged.
//      Flushes the pre-connect buffer (in chronological order) and switches
//      every subsequent frame to live streaming.
//   4. `stop()` — releases mic tracks, disconnects nodes, suspends context.
//
// Hard rules (from CLAUDE.md + xAI guide §6):
// - The AudioContext MUST be created/resumed inside the user-gesture click
//   handler BEFORE any await. Safari permanently suspends contexts created in
//   async callbacks.
// - The pre-connect buffer is CRITICAL. Users start speaking within 100–300ms
//   of tapping; without buffering, the first 200–700ms of speech is lost.
// - Buffer is capped at MIC_PREBUFFER_MAX_SAMPLES (~10s) to prevent memory
//   issues on slow connections.

import {
  FRAME_SAMPLES,
  MIC_PREBUFFER_MAX_SAMPLES,
  SAMPLE_RATE_HZ,
} from "../constants";
import { writeAmplitude } from "./amplitudeBus";
import { acquireMicStream, releaseMicStream } from "@/features/audio/micStream";
import { NO_SINK_ROUTING } from "@/features/audio/audioOutputSink";

const WORKLET_PATH = "/pcm-processor-worklet.js";

export type CaptureErrorCode =
  | "permission-denied"
  | "no-microphone"
  | "device-busy"
  | "track-ended"
  | "worklet-load-failed"
  | "unsupported"
  | "unknown";

export interface CaptureError {
  code: CaptureErrorCode;
  message: string;
  cause?: unknown;
}

export interface CaptureStats {
  /** PCM frames produced by the worklet since start(). */
  framesCaptured: number;
  /** Frames handed to the live sink (i.e. sent to the WebSocket) since start(). */
  framesSent: number;
  /** Frames currently held in the pre-connect buffer (pre session.updated). */
  framesBuffered: number;
  /** Most recent mic RMS [0..1] reported by the worklet. */
  lastRms: number;
  /** Date.now() of the last PCM frame, or null. */
  lastFrameAt: number | null;
  /** AudioContext state — "running" is required for process() to fire. */
  ctxState: AudioContextState | "none";
  /** Worklet process() invocation count — 0 means the worklet isn't scheduled. */
  processCalls: number;
  /** Whether the worklet's last heartbeat saw input channel data. */
  hasInput: boolean;
}

export interface AudioCaptureHandle {
  warmupSync: () => void;
  start: () => Promise<void>;
  /** Flush pre-buffer and route subsequent frames to `onFrame`. */
  setLive: (onFrame: (pcm: ArrayBuffer) => void) => void;
  stop: () => Promise<void>;
  /** Listen for unrecoverable capture errors (mic disconnect, permission revoked). */
  onError: (cb: (err: CaptureError) => void) => () => void;
  isActive: () => boolean;
  /** Live diagnostics — frame flow + amplitude. For the debug panel. */
  getStats: () => CaptureStats;
  /** When true, PCM is not forwarded to the live sink (session stays open). */
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
}

export function createAudioCapture(): AudioCaptureHandle {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let workletNode: AudioWorkletNode | null = null;
  // Muted tap into the destination. A capture-only worklet has 0 outputs, so it
  // is never connected to ctx.destination — and on Chrome a graph with NO path
  // to the destination is not pulled by the render thread, so the mic source
  // (and the worklet sharing it) never receives audio: process() runs with
  // empty inputs forever (captured=0, rms=0). Routing the source through a
  // gain=0 node to the destination keeps the source actively rendered, which
  // feeds the worklet its channel data without any audible playback/feedback.
  let keepAliveGain: GainNode | null = null;
  let trackEndedHandler: (() => void) | null = null;

  let prebuffer: ArrayBuffer[] = [];
  let prebufferedSamples = 0;
  let bufferOverflowedReported = false;
  // Whether we currently hold a ref on the shared mic stream — so release is
  // balanced exactly once across the abort/stop paths.
  let holdingMic = false;

  let liveSink: ((pcm: ArrayBuffer) => void) | null = null;
  let active = false;
  let muted = false;
  const errorCallbacks = new Set<(err: CaptureError) => void>();

  // Live diagnostics.
  let framesCaptured = 0;
  let framesSent = 0;
  let lastRms = 0;
  let lastFrameAt: number | null = null;
  // Worklet heartbeat — distinguishes "process() never runs" from "runs but no input".
  let processCalls = 0;
  let hasInput = false;

  function emitError(err: CaptureError): void {
    for (const cb of errorCallbacks) {
      try {
        cb(err);
      } catch {
        // Don't let a bad listener take down the cleanup path.
      }
    }
  }

  function warmupSync(): void {
    if (typeof window === "undefined") return;
    if (!ctx) {
      // Construct here, inside the click event microtask. Safari requires this.
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) {
        throw {
          code: "unsupported",
          message: "AudioContext is not available in this browser.",
        } satisfies CaptureError;
      }
      ctx = new Ctor({ sampleRate: SAMPLE_RATE_HZ });
      // Capture/keep-alive context — input only, never audible playback. Mark
      // it so the OUTPUT-device sink patch never re-routes it.
      (ctx as unknown as Record<string, unknown>)[NO_SINK_ROUTING] = true;
    }
    if (ctx.state === "suspended") {
      // resume() returns a Promise but we deliberately don't await — the
      // synchronous call inside the user gesture is what Safari needs.
      void ctx.resume();
    }
  }

  /**
   * Abort guard for the async `start()` path. `start()` has two awaits (mic
   * permission, worklet module). If `stop()` runs during either — toggle spam,
   * tab/route change, unmount — it sets `ctx = null`, which previously made the
   * post-await `ctx.createMediaStreamSource(...)` throw
   * "Cannot read properties of null". We snapshot the context at entry and, after
   * each await, bail out cleanly (releasing any half-acquired mic stream) if the
   * live `ctx` is no longer the one we started with.
   */
  async function start(): Promise<void> {
    if (active) return;
    framesCaptured = 0;
    framesSent = 0;
    lastRms = 0;
    lastFrameAt = null;
    processCalls = 0;
    hasInput = false;
    if (!ctx) warmupSync();
    if (!ctx)
      throw {
        code: "unsupported",
        message: "No AudioContext",
      } satisfies CaptureError;
    const localCtx = ctx;

    const abortIfTornDown = (): boolean => {
      if (ctx === localCtx) return false;
      // stop() ran while we awaited — release our shared-mic hold and bail.
      if (holdingMic) {
        releaseMicStream();
        holdingMic = false;
      }
      stream = null;
      return true;
    };

    // 1. Mic permission + stream (via the shared manager so we don't re-prompt
    //    on every session — it keeps the grant warm between uses).
    try {
      stream = await acquireMicStream({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: SAMPLE_RATE_HZ,
      });
      holdingMic = true;
    } catch (err: unknown) {
      const code = (
        (err as { name?: string })?.name === "NotAllowedError"
          ? "permission-denied"
          : (err as { name?: string })?.name === "NotFoundError"
            ? "no-microphone"
            : (err as { name?: string })?.name === "NotReadableError"
              ? "device-busy"
              : "unknown"
      ) satisfies CaptureErrorCode;
      const message =
        code === "permission-denied"
          ? "Microphone access denied — check browser permissions."
          : code === "no-microphone"
            ? "No microphone detected on this device."
            : code === "device-busy"
              ? "Microphone is in use by another application."
              : "Unable to access microphone.";
      throw { code, message, cause: err } satisfies CaptureError;
    }

    if (abortIfTornDown()) return;

    // Detect mid-session disconnect (unplugging, OS-level revoke).
    const [track] = stream.getAudioTracks();
    if (track) {
      trackEndedHandler = () => {
        emitError({
          code: "track-ended",
          message: "Microphone disconnected mid-session.",
        });
      };
      track.addEventListener("ended", trackEndedHandler);
    }

    // 2. Worklet
    try {
      await localCtx.audioWorklet.addModule(WORKLET_PATH);
    } catch (err) {
      throw {
        code: "worklet-load-failed",
        message:
          "Failed to load PCM AudioWorklet (public/pcm-processor-worklet.js).",
        cause: err,
      } satisfies CaptureError;
    }

    if (abortIfTornDown()) return;

    // 3. Wire the graph
    source = localCtx.createMediaStreamSource(stream);
    workletNode = new AudioWorkletNode(localCtx, "pcm-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    });

    workletNode.port.onmessage = (event: MessageEvent) => {
      const msg = event.data as
        | { type: "pcm"; payload: ArrayBuffer }
        | { type: "rms"; value: number }
        | { type: "diag"; calls: number; hasInput: boolean };

      if (msg.type === "pcm") {
        framesCaptured += 1;
        lastFrameAt = Date.now();
        if (liveSink && !muted) {
          framesSent += 1;
          liveSink(msg.payload);
        } else if (!liveSink) {
          // Pre-connect buffering with a safety cap.
          if (prebufferedSamples + FRAME_SAMPLES <= MIC_PREBUFFER_MAX_SAMPLES) {
            prebuffer.push(msg.payload);
            prebufferedSamples += FRAME_SAMPLES;
          } else if (!bufferOverflowedReported) {
            bufferOverflowedReported = true;
            console.warn(
              "[audioCapture] Pre-connect mic buffer overflowed safety cap " +
                `(${MIC_PREBUFFER_MAX_SAMPLES} samples). Subsequent frames will be dropped ` +
                "until session.updated arrives.",
            );
          }
        }
      } else if (msg.type === "rms") {
        if (muted) {
          lastRms = 0;
          writeAmplitude("mic", 0);
        } else {
          lastRms = msg.value;
          writeAmplitude("mic", msg.value);
        }
      } else if (msg.type === "diag") {
        processCalls = msg.calls;
        hasInput = msg.hasInput;
      }
    };

    source.connect(workletNode);

    // Muted keepalive path → destination so the render thread actually pulls
    // the source chain (see keepAliveGain comment above). gain=0 = silent.
    keepAliveGain = localCtx.createGain();
    keepAliveGain.gain.value = 0;
    source.connect(keepAliveGain);
    keepAliveGain.connect(localCtx.destination);

    // A context created via `new AudioContext()` can come up "suspended" even
    // after a synchronous warmup resume() — especially when the mic stream was
    // reused warm (no getUserMedia await gave resume() time to settle). Await
    // it here so process() actually starts; otherwise frames never flow.
    if (localCtx.state === "suspended") {
      try {
        await localCtx.resume();
      } catch {
        // ignore — if it can't resume we surface zero frames in the debug panel
      }
    }
    if (abortIfTornDown()) return;

    active = true;
  }

  function setLive(onFrame: (pcm: ArrayBuffer) => void): void {
    liveSink = onFrame;
    // Flush in chronological order — preserves the first 200–700ms of speech.
    if (prebuffer.length > 0) {
      const flushBatch = prebuffer;
      prebuffer = [];
      prebufferedSamples = 0;
      for (const frame of flushBatch) onFrame(frame);
    }
  }

  async function stop(): Promise<void> {
    active = false;
    muted = false;
    liveSink = null;
    prebuffer = [];
    prebufferedSamples = 0;
    bufferOverflowedReported = false;

    if (workletNode) {
      try {
        workletNode.port.onmessage = null;
        workletNode.disconnect();
      } catch {
        // already disconnected
      }
      workletNode = null;
    }
    if (source) {
      try {
        source.disconnect();
      } catch {
        // already disconnected
      }
      source = null;
    }
    if (keepAliveGain) {
      try {
        keepAliveGain.disconnect();
      } catch {
        // already disconnected
      }
      keepAliveGain = null;
    }
    if (stream) {
      if (trackEndedHandler) {
        for (const t of stream.getAudioTracks()) {
          t.removeEventListener("ended", trackEndedHandler);
        }
      }
      stream = null;
      trackEndedHandler = null;
    }
    // Release our hold on the shared mic (does NOT stop tracks immediately —
    // the manager keeps the grant warm so the next session won't re-prompt).
    if (holdingMic) {
      releaseMicStream();
      holdingMic = false;
    }
    if (ctx) {
      try {
        await ctx.suspend();
      } catch {
        // ignore
      }
      try {
        await ctx.close();
      } catch {
        // ignore
      }
      ctx = null;
    }
    writeAmplitude("mic", 0);
  }

  function onError(cb: (err: CaptureError) => void): () => void {
    errorCallbacks.add(cb);
    return () => errorCallbacks.delete(cb);
  }

  function isActive(): boolean {
    return active;
  }

  function getStats(): CaptureStats {
    return {
      framesCaptured,
      framesSent,
      framesBuffered: prebuffer.length,
      lastRms,
      lastFrameAt,
      ctxState: ctx?.state ?? "none",
      processCalls,
      hasInput,
    };
  }

  function setMuted(next: boolean): void {
    muted = next;
    if (next) {
      lastRms = 0;
      writeAmplitude("mic", 0);
    }
  }

  function isMuted(): boolean {
    return muted;
  }

  return {
    warmupSync,
    start,
    setLive,
    stop,
    onError,
    isActive,
    getStats,
    setMuted,
    isMuted,
  };
}
