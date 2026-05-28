"use client";
// features/voice-agent/components/VoiceListenHalo.tsx
//
// Focal listening cue — a warm halo positioned absolute behind the mic
// button. Scale and opacity bound to mic amplitude via the heavily-
// smoothed MotionValue from `useAudioAmplitude("mic")`. Even at zero
// amplitude the halo carries a calm 3–4 s breath via SMIL so the user
// has unambiguous "I'm listening" feedback while standing silent.
//
// Why split this out from VoiceAmbientGlow:
//   • The ambient glow is environmental — it fills the surface and reads
//     as "the room is alive". A user-listening cue rooted to the control
//     the user is touching is structurally different from an agent-
//     speaking wash descending from above.
//   • Mixing the two on one full-surface wash made it impossible to
//     glance at the screen and instantly tell who is talking.
//
// The halo sits at z=10 inside the hero section, behind the mic button
// (the button is in normal flow at z=10+; halo uses `absolute inset-0`
// inside its own positioning wrapper).
//
// Respects prefers-reduced-motion: SMIL breath stops, opacity holds at
// a soft level so the cue is still visible without motion.

import { motion, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@/lib/utils";
import type { VoiceStatus } from "../types";
import { useAudioAmplitude } from "../hooks/useAudioAmplitude";

interface VoiceListenHaloProps {
  status: VoiceStatus;
  /** Pixel size of the halo's bounding box. Defaults to 220 — a wide soft glow behind an 88px mic. */
  size?: number;
  className?: string;
}

const HALO_FLOOR_OPACITY = 0.22;
const HALO_AMP_RANGE = 0.55;
const AMPLITUDE_GAIN = 0.9;
const SCALE_AMP_RANGE = 0.18;
const KEY_SPLINES = "0.42 0 0.58 1; 0.42 0 0.58 1";

/** True when the halo should be visible at all. */
function isListeningStatus(status: VoiceStatus): boolean {
  return (
    status === "listening" ||
    status === "requesting-mic" ||
    status === "thinking"
  );
}

export function VoiceListenHalo({
  status,
  size = 220,
  className,
}: VoiceListenHaloProps) {
  const reduced = useReducedMotion();
  const micAmp = useAudioAmplitude("mic");

  const visible = isListeningStatus(status);

  const haloStrength = useTransform(micAmp, (m) => {
    if (!visible) return 0;
    if (status !== "listening") return 0.25; // calm pre-speech presence during requesting-mic / thinking
    if (reduced) return 0.4;
    return Math.min(m * AMPLITUDE_GAIN, 1);
  });

  const haloOpacity = useTransform(haloStrength, (s) =>
    visible ? HALO_FLOOR_OPACITY + s * HALO_AMP_RANGE : 0,
  );
  const haloScale = useTransform(haloStrength, (s) =>
    reduced ? 1 : 1 + s * SCALE_AMP_RANGE,
  );

  return (
    <div
      className={cn(
        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2",
        "left-1/2 top-1/2",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Outer soft warm halo — bound to amplitude. */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          opacity: haloOpacity,
          scale: haloScale,
          background:
            "radial-gradient(circle, oklch(0.84 0.16 50 / 0.85) 0%, oklch(0.72 0.18 30 / 0.45) 35%, transparent 70%)",
          filter: "blur(8px)",
        }}
        transition={{
          scale: { type: "spring", stiffness: 240, damping: 26 },
        }}
      />

      {/* Carrier breath — keeps the halo alive even when the user is
          silent. SMIL so the animation survives surrounding re-renders. */}
      {visible && !reduced && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="listen-halo-breath" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="oklch(0.88 0.18 55)" stopOpacity="0.35" />
              <stop offset="55%" stopColor="oklch(0.74 0.18 30)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="oklch(0.74 0.18 30)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="32" fill="url(#listen-halo-breath)">
            <animate
              attributeName="r"
              values="30;40;30"
              dur="3.6s"
              calcMode="spline"
              keySplines={KEY_SPLINES}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.55;1;0.55"
              dur="3.6s"
              calcMode="spline"
              keySplines={KEY_SPLINES}
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      )}
    </div>
  );
}
