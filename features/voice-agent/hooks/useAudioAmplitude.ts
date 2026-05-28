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
//
// ─── Smoothing model ──────────────────────────────────────────────────
//
// The signal arrives at audio-frame rate (~50 Hz from the playback
// analyser, ~50 Hz from the mic worklet). If we wrote it straight into
// the MotionValue the visualizer would strobe at speech-band frequencies.
// We want audio peaks to *suggest* the glow's level, not drive it
// frame-by-frame.
//
// Two-stage envelope follower:
//   • Stage 1 — asymmetric attack/release on the raw signal. Fast attack
//     so onset of speech isn't lazy; slow release so silence fades
//     gracefully. Approximate per-frame coefficients at ~60 fps:
//        attack ≈ 0.15  (rise τ ≈  110 ms)
//        release ≈ 0.02 (fall τ ≈  830 ms)
//   • Stage 2 — pure exponential on the envelope. Smears the asymmetric
//     stage into a continuous swell. Effective additional τ ≈ 300 ms.
//
// Net: glow rises within ~300–500 ms of speech onset and fades over
// ~1–1.5 s on silence. If the next agent thinks this feels sluggish, the
// fix is to expose these as configurable knobs — NOT to crank ATTACK_ALPHA
// back toward 1.0, which is what produces the strobing.

import { useEffect } from "react";
import { useMotionValue, type MotionValue } from "motion/react";
import { getAmplitudeRef, type AmplitudeTarget } from "../audio/amplitudeBus";

/** Stage 1 — fast attack: rise quickly when speech starts. */
const ATTACK_ALPHA = 0.15;
/** Stage 1 — slow release: fade gracefully on silence. */
const RELEASE_ALPHA = 0.02;
/** Stage 2 — slow exponential on the envelope to remove residual texture. */
const FINAL_SMOOTHING_ALPHA = 0.05;

export function useAudioAmplitude(target: AmplitudeTarget): MotionValue<number> {
  const mv = useMotionValue(0);

  useEffect(() => {
    const ref = getAmplitudeRef(target);
    let rafId: number | null = null;
    let envelope = 0;
    let smoothed = 0;

    const tick = () => {
      const raw = ref.current ?? 0;
      const alpha1 = raw > envelope ? ATTACK_ALPHA : RELEASE_ALPHA;
      envelope = envelope + alpha1 * (raw - envelope);
      smoothed = smoothed + FINAL_SMOOTHING_ALPHA * (envelope - smoothed);
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
