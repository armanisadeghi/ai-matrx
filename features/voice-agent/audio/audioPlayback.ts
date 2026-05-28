// features/voice-agent/audio/audioPlayback.ts
//
// Playback pipeline for xAI's PCM audio stream.
//
// Decoding + scheduling:
//   - Each incoming base64 chunk is decoded to Float32 and wrapped in an
//     AudioBuffer at 24kHz.
//   - We schedule the next buffer at `Math.max(now, nextPlayTime)` and advance
//     `nextPlayTime` by the buffer's duration. This produces gapless playback.
//
// Visualizer:
//   - A single AnalyserNode sits between the playback graph and `destination`.
//     We read time-domain bytes, compute RMS, write to amplitudeBus.
//   - The polling loop runs only while there are queued sources (i.e. while
//     the assistant is actually speaking).
//
// Interruption:
//   - `interrupt()` is called synchronously inside the speech_started handler.
//     It calls `BufferSource.stop(0)` on every queued source (sub-frame stop),
//     clears the queue, resets `nextPlayTime`, and returns the ms of audio
//     that actually played for this turn (for the interrupted-turn metadata).

import { SAMPLE_RATE_HZ } from "../constants";
import { base64ToFloat32 } from "./pcmEncoding";
import { writeAmplitude } from "./amplitudeBus";

export interface AudioPlaybackHandle {
  warmupSync: () => void;
  enqueue: (b64Chunk: string) => void;
  /** Stops all queued audio synchronously. Returns ms of audio that actually played for the current turn. */
  interrupt: () => number;
  /** Called once a turn finishes (response.done). Resets per-turn duration accounting. */
  markTurnEnded: () => number;
  /**
   * Ms of audio actually played so far in the current turn, in real wall-
   * clock time. Returns 0 before the first byte of a turn arrives. Clamped
   * to `turnPlayedMs` (the total scheduled duration) so we never report
   * more elapsed than has been queued. Used by the orchestrator to gate
   * transcript reveal on audible playback position.
   */
  getTurnElapsedMs: () => number;
  onIdle: (cb: () => void) => () => void;
  stop: () => Promise<void>;
}

export function createAudioPlayback(): AudioPlaybackHandle {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let analyserData: Uint8Array | null = null;

  const queued: AudioBufferSourceNode[] = [];
  let nextPlayTime = 0;
  let turnPlayedMs = 0;
  /** ctx.currentTime at which the first buffer of the active turn was scheduled. Null between turns. */
  let turnStartedAtCtxTime: number | null = null;
  let rmsRafId: number | null = null;

  const idleCallbacks = new Set<() => void>();

  function warmupSync(): void {
    if (typeof window === "undefined") return;
    if (!ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) {
        throw new Error("AudioContext is not available in this browser.");
      }
      ctx = new Ctor({ sampleRate: SAMPLE_RATE_HZ });
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      analyserData = new Uint8Array(analyser.fftSize);
      analyser.connect(ctx.destination);
    }
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
  }

  function startRmsLoop(): void {
    if (rmsRafId !== null || !analyser || !analyserData) return;
    const tick = () => {
      if (!analyser || !analyserData) {
        rmsRafId = null;
        return;
      }
      analyser.getByteTimeDomainData(analyserData);
      let sumSq = 0;
      for (let i = 0; i < analyserData.length; i++) {
        // Center around 0: bytes are in [0, 255] with 128 = silence.
        const v = (analyserData[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / analyserData.length);
      writeAmplitude("assistant", rms);

      if (queued.length === 0) {
        // Drain the visualizer to 0 once playback truly ends.
        writeAmplitude("assistant", 0);
        rmsRafId = null;
        return;
      }
      rmsRafId = requestAnimationFrame(tick);
    };
    rmsRafId = requestAnimationFrame(tick);
  }

  function notifyIdleIfDrained(): void {
    if (queued.length === 0) {
      for (const cb of idleCallbacks) {
        try {
          cb();
        } catch {
          // ignore
        }
      }
    }
  }

  function enqueue(b64: string): void {
    if (!ctx || !analyser) {
      warmupSync();
    }
    if (!ctx || !analyser) return;

    const float32 = base64ToFloat32(b64);
    if (float32.length === 0) return;

    const buf = ctx.createBuffer(1, float32.length, SAMPLE_RATE_HZ);
    buf.getChannelData(0).set(float32);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(analyser);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextPlayTime);
    src.start(startAt);

    if (turnStartedAtCtxTime === null) {
      // First chunk of a new turn — anchor the elapsed clock at its scheduled play time.
      turnStartedAtCtxTime = startAt;
    }
    nextPlayTime = startAt + buf.duration;
    turnPlayedMs += buf.duration * 1000;
    queued.push(src);

    src.onended = () => {
      const idx = queued.indexOf(src);
      if (idx !== -1) queued.splice(idx, 1);
      try {
        src.disconnect();
      } catch {
        // already disconnected
      }
      notifyIdleIfDrained();
    };

    startRmsLoop();
  }

  function interrupt(): number {
    const playedMs = turnPlayedMs;
    // Stop synchronously — sub-frame.
    for (const src of queued) {
      try {
        src.onended = null;
        src.stop(0);
        src.disconnect();
      } catch {
        // already stopped / disconnected
      }
    }
    queued.length = 0;
    nextPlayTime = ctx ? ctx.currentTime : 0;
    turnPlayedMs = 0;
    turnStartedAtCtxTime = null;
    writeAmplitude("assistant", 0);
    if (rmsRafId !== null) {
      cancelAnimationFrame(rmsRafId);
      rmsRafId = null;
    }
    notifyIdleIfDrained();
    return playedMs;
  }

  function markTurnEnded(): number {
    const playedMs = turnPlayedMs;
    turnPlayedMs = 0;
    turnStartedAtCtxTime = null;
    return playedMs;
  }

  function getTurnElapsedMs(): number {
    if (!ctx || turnStartedAtCtxTime === null) return 0;
    const elapsedMs = Math.max(0, (ctx.currentTime - turnStartedAtCtxTime) * 1000);
    // Never report more elapsed than we've actually scheduled.
    return Math.min(elapsedMs, turnPlayedMs);
  }

  function onIdle(cb: () => void): () => void {
    idleCallbacks.add(cb);
    return () => idleCallbacks.delete(cb);
  }

  async function stop(): Promise<void> {
    interrupt();
    idleCallbacks.clear();
    if (analyser) {
      try {
        analyser.disconnect();
      } catch {
        // ignore
      }
      analyser = null;
      analyserData = null;
    }
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        // ignore
      }
      ctx = null;
    }
    writeAmplitude("assistant", 0);
  }

  return {
    warmupSync,
    enqueue,
    interrupt,
    markTurnEnded,
    getTurnElapsedMs,
    onIdle,
    stop,
  };
}
