// features/voice-agent/audio/amplitudeBus.ts
//
// Pure-ref amplitude transport for the visualizer.
//
// The audio modules (capture + playback) write into these refs ~hundreds of
// times per second. A React hook (`useAudioAmplitude`) reads them via
// requestAnimationFrame and pipes the value into a motion/react MotionValue.
// This keeps amplitude data out of React state — no per-frame re-renders.
//
// Each "target" gets its own ref. Multiple consumers can read the same target
// concurrently because the ref is shared.

import type { RefObject } from "react";

export type AmplitudeTarget = "mic" | "assistant";

interface AmplitudeRef {
  current: number;
}

const refs: Record<AmplitudeTarget, AmplitudeRef> = {
  mic: { current: 0 },
  assistant: { current: 0 },
};

export function getAmplitudeRef(
  target: AmplitudeTarget,
): RefObject<number> {
  // The cast is safe: AmplitudeRef matches RefObject<number>'s public shape.
  return refs[target] as RefObject<number>;
}

export function writeAmplitude(target: AmplitudeTarget, value: number): void {
  // Clamp to [0, 1] defensively.
  const v = value < 0 ? 0 : value > 1 ? 1 : value;
  refs[target].current = v;
}

export function resetAmplitude(target: AmplitudeTarget): void {
  refs[target].current = 0;
}
