// features/voice-agent/hooks/useAudioAmplitude.ts
//
// Subscribes via requestAnimationFrame to the shared amplitude ref for a
// given target (`mic` | `assistant`) and pipes the value into a
// motion/react MotionValue. The visualizer binds the MotionValue to scale,
// opacity, glow, etc. via `useTransform` — so per-frame amplitude updates
// drive zero React renders.
//
// Why a single rAF loop per consumer: motion/react MotionValues are
// designed for high-frequency writes. The loop only runs while the
// consumer hook is mounted.

import { useEffect } from "react";
import { useMotionValue, type MotionValue } from "motion/react";
import { getAmplitudeRef, type AmplitudeTarget } from "../audio/amplitudeBus";

/** A smoothing constant in (0, 1] — 1 = no smoothing, 0.3 = noticeable ease. */
const SMOOTHING_ALPHA = 0.35;

export function useAudioAmplitude(target: AmplitudeTarget): MotionValue<number> {
  const mv = useMotionValue(0);

  useEffect(() => {
    const ref = getAmplitudeRef(target);
    let rafId: number | null = null;
    let smoothed = 0;

    const tick = () => {
      const raw = ref.current ?? 0;
      // Exponential smoothing — feels organic, avoids jitter on idle mic noise.
      smoothed = smoothed + SMOOTHING_ALPHA * (raw - smoothed);
      mv.set(smoothed);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      mv.set(0);
    };
  }, [mv, target]);

  return mv;
}
