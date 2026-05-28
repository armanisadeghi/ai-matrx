"use client";
// features/voice-agent/components/VoiceAmbientGlow.tsx
//
// The voice surface's ambient mood layer — agent-speaking only after the
// May 2026 split. User-listening got its own focal halo (`VoiceListenHalo`)
// because mixing the two on one full-surface wash made the room feel
// "always alive" with no structural separation between "I'm talking" and
// "you're talking".
//
// Language now:
//   • CONNECTING / THINKING       → slow primary breath from the top.
//   • SPEAKING (agent speaking)   → cool indigo dome descending from
//                                   above. Brightens with assistant
//                                   amplitude.
//   • INTERRUPTING                → quick warm flash, then back.
//   • ERROR                       → steady destructive halo.
//   • IDLE / REQUESTING / LISTENING → ambient is dark; the halo carries
//                                   the listening cue.
//
// Geometry rule:
//   Every radial fades fully to transparent INSIDE the viewport, never at
//   or past the edges. The previous version anchored ellipses just off
//   the edge with 110%×78% radii AND added a 220px inset rim — the
//   combined effect was the whole viewport breathing. The current
//   geometry anchors at 50%/110% with 70%×45% radii so the glow stops
//   around mid-viewport and the edges stay dark.
//
// Honors prefers-reduced-motion: amplitude scale is fixed, opacity floors
// at a steady level for each state, no SMIL or pulsing.

import { motion, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@/lib/utils";
import type { VoiceStatus } from "../types";
import { useAudioAmplitude } from "../hooks/useAudioAmplitude";

interface VoiceAmbientGlowProps {
  status: VoiceStatus;
  className?: string;
}

// Tuning constants — pulled out so they read as a design knob, not magic.
const SPEAK_FLOOR = 0.10;
const SPEAK_AMP_RANGE = 0.62;
const AMPLITUDE_GAIN = 0.9;
const SCALE_AMP_RANGE = 0.05;

export function VoiceAmbientGlow({ status, className }: VoiceAmbientGlowProps) {
  const reduced = useReducedMotion();
  const assistantAmp = useAudioAmplitude("assistant");

  const speakStrength = useTransform(assistantAmp, (a) => {
    if (status !== "speaking" && status !== "interrupting") return 0;
    if (reduced) return 0.5;
    return Math.min(a * AMPLITUDE_GAIN, 1);
  });

  const speakOpacity = useTransform(speakStrength, (s) =>
    status === "speaking" || status === "interrupting"
      ? SPEAK_FLOOR + s * SPEAK_AMP_RANGE
      : 0,
  );
  const speakScale = useTransform(speakStrength, (s) =>
    reduced ? 1 : 1 + s * SCALE_AMP_RANGE,
  );
  const speakInnerOpacity = useTransform(speakStrength, (s) =>
    status === "speaking" || status === "interrupting" ? 0.18 + s * 0.5 : 0,
  );
  const speakInnerScale = useTransform(speakStrength, (s) =>
    reduced ? 1 : 0.9 + s * 0.25,
  );

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
      aria-hidden="true"
    >
      {/* CONNECTING / THINKING — slow primary breath from the top. Replaces
          the prior centered-and-full breath; matches the agent's "from
          above" spatial cue. */}
      {(status === "connecting" || status === "thinking") && !reduced && (
        <motion.div
          key={`breath-${status}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.06, 0.20, 0.06] }}
          transition={{
            duration: status === "thinking" ? 2.6 : 1.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            background:
              "radial-gradient(ellipse 70% 45% at 50% -10%, hsl(var(--primary) / 0.45) 0%, hsl(var(--primary) / 0.10) 40%, transparent 75%)",
          }}
        />
      )}
      {/* Reduced-motion fallback for thinking/connecting — steady tint. */}
      {(status === "connecting" || status === "thinking") && reduced && (
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.18,
            background:
              "radial-gradient(ellipse 70% 45% at 50% -10%, hsl(var(--primary) / 0.45) 0%, transparent 75%)",
          }}
        />
      )}

      {/* SPEAKING — cool dome descending from above. The agent "responds
          from above" — distinct from the user's focal halo near the mic. */}
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: speakOpacity,
          scale: speakScale,
          transformOrigin: "50% 0%",
          background:
            "radial-gradient(ellipse 70% 45% at 50% -10%, oklch(0.76 0.18 250) 0%, oklch(0.58 0.22 275 / 0.55) 28%, transparent 65%)",
        }}
        transition={{
          scale: { type: "spring", stiffness: 220, damping: 28 },
        }}
      />

      {/* SPEAKING — inner highlight from above. Smaller, brighter, sits at
          the dome's source for an organic "leading edge". */}
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: speakInnerOpacity,
          scale: speakInnerScale,
          transformOrigin: "50% 0%",
          background:
            "radial-gradient(circle 35% at 50% -15%, oklch(0.86 0.20 260 / 0.75) 0%, transparent 55%)",
          filter: "blur(6px)",
        }}
      />

      {/* INTERRUPTING — quick single flash. Tells the user "got it, holding". */}
      {status === "interrupting" && !reduced && (
        <motion.div
          key="interrupt-flash"
          className="absolute inset-0"
          initial={{ opacity: 0.35 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% -10%, oklch(0.85 0.16 60 / 0.45) 0%, transparent 60%)",
          }}
        />
      )}

      {/* ERROR — steady destructive halo, contained near top. */}
      <div
        className="absolute inset-0 transition-opacity duration-400 ease-out"
        style={{
          opacity: status === "error" ? 0.45 : 0,
          background:
            "radial-gradient(ellipse 70% 45% at 50% -10%, hsl(var(--destructive) / 0.45) 0%, hsl(var(--destructive) / 0.10) 35%, transparent 70%)",
        }}
      />
    </div>
  );
}
