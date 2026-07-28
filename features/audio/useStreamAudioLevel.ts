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
// This is the one implementation new code consumes. Non-React modules consume
// the same core directly via `createStreamLevelMeter`
// (`features/audio/streamLevelMeter.ts`) — the graph + math live there once.
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

import { useEffect, useState } from "react";
import { createStreamLevelMeter } from "@/features/audio/streamLevelMeter";

/**
 * Live input level (0-100) for `stream`, or 0 when `stream` is null/silent.
 * Safe to call with a stream that has no audio track — it simply reads 0.
 */
export function useStreamAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  const metered = stream !== null && stream.getAudioTracks().length > 0;

  useEffect(() => {
    if (!metered || !stream) return;
    const meter = createStreamLevelMeter(stream, setLevel);
    // stop() cancels the rAF, disconnects the graph, and emits a final 0.
    return () => meter.stop();
  }, [stream, metered]);

  // Derived, not reset-in-an-effect: with nothing to meter the level IS zero,
  // so there is never a frame showing a stale level from a previous stream.
  return metered ? level : 0;
}
