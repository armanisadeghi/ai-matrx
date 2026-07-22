// features/audio/useStreamAudioLevel.ts
//
// THE canonical React hook for a live 0-100 microphone/stream level, for
// meters like `<AudioLevelIndicator>`.
//
// WHY IT EXISTS
// -------------
// Five modules had grown their own inline AnalyserNode + rAF loop
// (useSimpleRecorder, useChunkedRecordAndTranscribe, MediaDevicesPanel,
// voice-agent/audio/audioCapture, flashcards/fast-fire/continuousCapture).
// Every one of them re-derived the same scaling and the same teardown, and a
// missed teardown leaks a rAF loop + a graph node for the life of the tab.
// This is the one implementation new code consumes.
//
// CONTRACT
// - Pass a live `MediaStream` (with at least one audio track) to meter it;
//   pass `null` to stop metering and reset the level to 0.
// - Uses the SHARED AudioContext (`features/audio/audioContext.ts`) — never a
//   second context. iOS caps live AudioContexts; churning one per meter is how
//   a recording silently fails to start.
// - Analysis only. `MediaRecorder` records straight off the MediaStream, so
//   this graph is cosmetic and can never affect the never-lose-audio path.
// - Teardown disconnects the analyser + source node on every exit (stream
//   change, unmount). The shared context is never closed.

"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * Live input level (0-100) for `stream`, or 0 when `stream` is null/silent.
 * Safe to call with a stream that has no audio track — it simply reads 0.
 */
export function useStreamAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  const frameRef = useRef<number | null>(null);
  const metered = stream !== null && stream.getAudioTracks().length > 0;

  useEffect(() => {
    if (!metered || !stream) return;

    let cancelled = false;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    // Async by design (the shared context may need a gesture-driven resume).
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
        console.error("[useStreamAudioLevel] analyser graph failed:", err);
        return;
      }

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = (): void => {
        if (cancelled || !analyser) return;
        analyser.getByteFrequencyData(data);
        setLevel(normalize(data));
        frameRef.current = requestAnimationFrame(tick);
      };
      tick();
    })();

    return () => {
      cancelled = true;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      // Disconnect (never close — the context is shared).
      try {
        source?.disconnect();
      } catch (err) {
        console.error("[useStreamAudioLevel] source disconnect threw:", err);
      }
      try {
        analyser?.disconnect();
      } catch (err) {
        console.error("[useStreamAudioLevel] analyser disconnect threw:", err);
      }
      setLevel(0);
    };
  }, [stream, metered]);

  // Derived, not reset-in-an-effect: with nothing to meter the level IS zero,
  // so there is never a frame showing a stale level from a previous stream.
  return metered ? level : 0;
}
