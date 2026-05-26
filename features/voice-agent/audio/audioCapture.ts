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

export interface AudioCaptureHandle {
  warmupSync: () => void;
  start: () => Promise<void>;
  /** Flush pre-buffer and route subsequent frames to `onFrame`. */
  setLive: (onFrame: (pcm: ArrayBuffer) => void) => void;
  stop: () => Promise<void>;
  /** Listen for unrecoverable capture errors (mic disconnect, permission revoked). */
  onError: (cb: (err: CaptureError) => void) => () => void;
  isActive: () => boolean;
}

export function createAudioCapture(): AudioCaptureHandle {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let trackEndedHandler: (() => void) | null = null;

  let prebuffer: ArrayBuffer[] = [];
  let prebufferedSamples = 0;
  let bufferOverflowedReported = false;

  let liveSink: ((pcm: ArrayBuffer) => void) | null = null;
  let active = false;
  const errorCallbacks = new Set<(err: CaptureError) => void>();

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
    }
    if (ctx.state === "suspended") {
      // resume() returns a Promise but we deliberately don't await — the
      // synchronous call inside the user gesture is what Safari needs.
      void ctx.resume();
    }
  }

  async function start(): Promise<void> {
    if (active) return;
    if (!ctx) warmupSync();
    if (!ctx) throw { code: "unsupported", message: "No AudioContext" } satisfies CaptureError;

    // 1. Mic permission + stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: SAMPLE_RATE_HZ,
        },
      });
    } catch (err: unknown) {
      const code = ((err as { name?: string })?.name === "NotAllowedError"
        ? "permission-denied"
        : (err as { name?: string })?.name === "NotFoundError"
          ? "no-microphone"
          : (err as { name?: string })?.name === "NotReadableError"
            ? "device-busy"
            : "unknown") satisfies CaptureErrorCode;
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
      await ctx.audioWorklet.addModule(WORKLET_PATH);
    } catch (err) {
      throw {
        code: "worklet-load-failed",
        message:
          "Failed to load PCM AudioWorklet (public/pcm-processor-worklet.js).",
        cause: err,
      } satisfies CaptureError;
    }

    // 3. Wire the graph
    source = ctx.createMediaStreamSource(stream);
    workletNode = new AudioWorkletNode(ctx, "pcm-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    });

    workletNode.port.onmessage = (event: MessageEvent) => {
      const msg = event.data as
        | { type: "pcm"; payload: ArrayBuffer }
        | { type: "rms"; value: number };

      if (msg.type === "pcm") {
        if (liveSink) {
          liveSink(msg.payload);
        } else {
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
        writeAmplitude("mic", msg.value);
      }
    };

    source.connect(workletNode);
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
    if (stream) {
      for (const t of stream.getTracks()) {
        if (trackEndedHandler) t.removeEventListener("ended", trackEndedHandler);
        try {
          t.stop();
        } catch {
          // ignore
        }
      }
      stream = null;
      trackEndedHandler = null;
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

  return { warmupSync, start, setLive, stop, onError, isActive };
}
