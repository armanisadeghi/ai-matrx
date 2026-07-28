// features/audio/streamLevelMeter.ts
//
// THE framework-free core of the canonical mic/stream level meter (0-100).
// `useStreamAudioLevel` (the React hook) and non-React modules (e.g.
// flashcards fast-fire `continuousCapture`) BOTH consume this — the analyser
// graph, scaling math, rAF loop, and teardown live here exactly once.
//
// CONTRACT (identical to the hook's)
// - Uses the SHARED AudioContext (`features/audio/audioContext.ts`) — never a
//   second context. The context is never closed here.
// - Analysis only; recording paths are untouched by this graph.
// - `stop()` cancels the rAF loop, disconnects the source + analyser on every
//   exit path (including a stop racing the async context resume), and emits a
//   final level of 0.

import {
  getSharedAudioContext,
  resumeSharedAudioContext,
} from "@/features/audio/audioContext";

/** Matches the scaling every prior inline copy used (headroom for visibility). */
function normalize(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) sum += data[i];
  const average = sum / Math.max(1, data.length);
  return Math.min(100, (average / 255) * 150);
}

export interface StreamLevelMeter {
  /** Idempotent teardown: cancels the rAF loop, disconnects the graph, emits 0. */
  stop(): void;
}

/**
 * Start metering `stream`, reporting a live 0-100 input level via `onLevel`
 * (one call per animation frame). Starts asynchronously (the shared context
 * may need a gesture-driven resume); if the graph cannot be built the meter
 * stays silently at 0 after a loud console.error.
 */
export function createStreamLevelMeter(
  stream: MediaStream,
  onLevel: (level: number) => void,
): StreamLevelMeter {
  let cancelled = false;
  let frameId: number | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;

  void (async () => {
    await resumeSharedAudioContext();
    if (cancelled) return;
    const ctx = getSharedAudioContext();
    if (!ctx) return; // No Web Audio here — the meter stays at 0, loudly inert.
    try {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch (err) {
      console.error("[streamLevelMeter] analyser graph failed:", err);
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = (): void => {
      if (cancelled || !analyser) return;
      analyser.getByteFrequencyData(data);
      onLevel(normalize(data));
      frameId = requestAnimationFrame(tick);
    };
    tick();
  })();

  return {
    stop() {
      if (cancelled) return;
      cancelled = true;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      // Disconnect (never close — the context is shared).
      try {
        source?.disconnect();
      } catch (err) {
        console.error("[streamLevelMeter] source disconnect threw:", err);
      }
      try {
        analyser?.disconnect();
      } catch (err) {
        console.error("[streamLevelMeter] analyser disconnect threw:", err);
      }
      source = null;
      analyser = null;
      onLevel(0);
    },
  };
}
