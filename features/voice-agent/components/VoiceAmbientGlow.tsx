"use client";
// features/voice-agent/components/VoiceAmbientGlow.tsx
//
// The voice surface's ambient mood layer. Replaces the central orb that
// "looked like a button". This is a non-interactive, full-surface radial
// glow whose color, position, and intensity convey what the agent is
// doing — without ever being mistaken for a control.
//
// Language:
//   • LISTENING (user speaking)  →  warm amber rising from the bottom,
//                                   anchored where the mic button is.
//                                   Brightens with mic amplitude.
//   • SPEAKING  (agent speaking) →  cool indigo descending from the top.
//                                   Brightens with assistant amplitude.
//   • CONNECTING / THINKING      →  slow primary breath, centered.
//   • IDLE                       →  near-invisible primary wash near the
//                                   mic so the surface is never dead.
//   • ERROR                      →  steady destructive halo.
//
// Why ambient (not centered orb):
//   • A centered glowing circle invites a tap. A radial-edge wash does not.
//   • Two anchor points (bottom = you, top = agent) make the source of
//     sound spatially legible — the user instantly understands who is
//     "active" at any moment.
//   • Bound directly to amplitude MotionValues — zero React renders per
//     audio frame, same pattern as the previous VoiceVisualizer.
//
// Honors prefers-reduced-motion: amplitude-driven scale is disabled and
// opacity floors at a steady level for each state, so the user still
// gets state feedback without motion.

import { motion, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@/lib/utils";
import type { VoiceStatus } from "../types";
import { useAudioAmplitude } from "../hooks/useAudioAmplitude";

interface VoiceAmbientGlowProps {
  status: VoiceStatus;
  className?: string;
}

// Tuning constants — pulled out so they read as a design knob, not magic.
const LISTEN_FLOOR = 0.32;
const LISTEN_AMP_RANGE = 0.62;
const SPEAK_FLOOR = 0.34;
const SPEAK_AMP_RANGE = 0.62;
const AMPLITUDE_GAIN = 1.4; // perceptual boost — silence still reads ~0
const SCALE_AMP_RANGE = 0.08;

export function VoiceAmbientGlow({ status, className }: VoiceAmbientGlowProps) {
  const reduced = useReducedMotion();
  const micAmp = useAudioAmplitude("mic");
  const assistantAmp = useAudioAmplitude("assistant");

  // Per-source "strength" 0..1. Each one only goes non-zero when the
  // matching status is active, so all glows can be mounted at once and
  // the math chooses what's visible.
  const listenStrength = useTransform(micAmp, (m) => {
    if (status !== "listening") return 0;
    if (reduced) return 0.5;
    return Math.min(m * AMPLITUDE_GAIN, 1);
  });
  const speakStrength = useTransform(assistantAmp, (a) => {
    if (status !== "speaking" && status !== "interrupting") return 0;
    if (reduced) return 0.5;
    return Math.min(a * AMPLITUDE_GAIN, 1);
  });

  // Derived presentation values per glow layer.
  const listenOpacity = useTransform(listenStrength, (s) =>
    status === "listening" ? LISTEN_FLOOR + s * LISTEN_AMP_RANGE : 0,
  );
  const listenScale = useTransform(listenStrength, (s) =>
    reduced ? 1 : 1 + s * SCALE_AMP_RANGE,
  );
  // Inner highlight — smaller, brighter, slightly above the main glow.
  const listenInnerOpacity = useTransform(listenStrength, (s) =>
    status === "listening" ? 0.22 + s * 0.6 : 0,
  );
  const listenInnerScale = useTransform(listenStrength, (s) =>
    reduced ? 1 : 0.85 + s * 0.35,
  );

  const speakOpacity = useTransform(speakStrength, (s) =>
    status === "speaking" || status === "interrupting"
      ? SPEAK_FLOOR + s * SPEAK_AMP_RANGE
      : 0,
  );
  const speakScale = useTransform(speakStrength, (s) =>
    reduced ? 1 : 1 + s * SCALE_AMP_RANGE,
  );
  const speakInnerOpacity = useTransform(speakStrength, (s) =>
    status === "speaking" || status === "interrupting" ? 0.22 + s * 0.6 : 0,
  );
  const speakInnerScale = useTransform(speakStrength, (s) =>
    reduced ? 1 : 0.85 + s * 0.35,
  );

  // Inset rim — picks up the active hue and breathes with amplitude.
  // The "screen edges are alive" feeling. Uses currentColor so a single
  // className flip swaps tier (warm/cool/destructive/primary).
  //
  // `useTransform` with a tuple input types the destructured values as
  // `unknown` in motion/react v12, so we narrow explicitly inside.
  const rimOpacity = useTransform(
    [micAmp, assistantAmp] as const,
    ([m, a]) => {
      const mn = (m as number) ?? 0;
      const an = (a as number) ?? 0;
      if (status === "listening") {
        return 0.28 + Math.min(mn * AMPLITUDE_GAIN, 1) * 0.45;
      }
      if (status === "speaking" || status === "interrupting") {
        return 0.28 + Math.min(an * AMPLITUDE_GAIN, 1) * 0.45;
      }
      if (status === "thinking") return 0.20;
      if (status === "connecting") return 0.14;
      if (status === "error") return 0.40;
      if (status === "requesting-mic") return 0.18;
      return 0;
    },
  );

  // Idle wash — a tiny floor of primary glow at the bottom so the surface
  // never looks "off" while waiting for the user to tap. Pure CSS, no rAF.
  const idleVisible = status === "idle";
  const requestingVisible = status === "requesting-mic";

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
      aria-hidden="true"
    >
      {/* IDLE WASH — barely-there primary glow at the bottom. */}
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-out"
        style={{
          opacity: idleVisible ? 1 : 0,
          background:
            "radial-gradient(ellipse 95% 55% at 50% 110%, hsl(var(--primary) / 0.10) 0%, hsl(var(--primary) / 0.04) 40%, transparent 75%)",
        }}
      />

      {/* REQUESTING-MIC — a gentle pre-listen tint so the user gets feedback
          while the OS permission prompt sits in front of the page. */}
      <div
        className="absolute inset-0 transition-opacity duration-500 ease-out"
        style={{
          opacity: requestingVisible ? 1 : 0,
          background:
            "radial-gradient(ellipse 100% 65% at 50% 105%, oklch(0.78 0.16 60 / 0.18) 0%, transparent 70%)",
        }}
      />

      {/* CONNECTING / THINKING — slow primary breath, full ambient. */}
      {(status === "connecting" || status === "thinking") && !reduced && (
        <motion.div
          key={`breath-${status}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.08, 0.28, 0.08] }}
          transition={{
            duration: status === "thinking" ? 2.6 : 1.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            background:
              "radial-gradient(ellipse 90% 80% at 50% 60%, hsl(var(--primary) / 0.45) 0%, hsl(var(--primary) / 0.12) 40%, transparent 75%)",
          }}
        />
      )}
      {/* Reduced-motion fallback for thinking/connecting — steady tint, no pulse. */}
      {(status === "connecting" || status === "thinking") && reduced && (
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.22,
            background:
              "radial-gradient(ellipse 90% 80% at 50% 60%, hsl(var(--primary) / 0.45) 0%, transparent 75%)",
          }}
        />
      )}

      {/* LISTENING — primary warm glow, rises from the bottom edge.
          The transform-origin sits below the viewport so growth feels like
          the room is "leaning in" to catch the user's voice. */}
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: listenOpacity,
          scale: listenScale,
          transformOrigin: "50% 100%",
          background:
            "radial-gradient(ellipse 110% 78% at 50% 108%, oklch(0.78 0.18 35) 0%, oklch(0.66 0.20 18 / 0.62) 28%, transparent 65%)",
        }}
        transition={{
          scale: { type: "spring", stiffness: 260, damping: 26 },
        }}
      />

      {/* LISTENING — inner highlight. Smaller, brighter, slightly above the
          main warm wash. Adds shimmer at the moments of speech onset. */}
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: listenInnerOpacity,
          scale: listenInnerScale,
          transformOrigin: "50% 100%",
          background:
            "radial-gradient(circle 60% at 50% 115%, oklch(0.88 0.21 50 / 0.85) 0%, transparent 50%)",
          filter: "blur(6px)",
        }}
      />

      {/* SPEAKING — cool glow, descends from the top. The agent "responds
          from above" — a stable spatial cue distinct from the user's
          bottom-up listening pulse. */}
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: speakOpacity,
          scale: speakScale,
          transformOrigin: "50% 0%",
          background:
            "radial-gradient(ellipse 110% 78% at 50% -8%, oklch(0.76 0.18 250) 0%, oklch(0.58 0.22 275 / 0.62) 28%, transparent 65%)",
        }}
        transition={{
          scale: { type: "spring", stiffness: 260, damping: 26 },
        }}
      />

      {/* SPEAKING — inner highlight from above. */}
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: speakInnerOpacity,
          scale: speakInnerScale,
          transformOrigin: "50% 0%",
          background:
            "radial-gradient(circle 60% at 50% -15%, oklch(0.86 0.20 260 / 0.85) 0%, transparent 50%)",
          filter: "blur(6px)",
        }}
      />

      {/* INTERRUPTING — quick single flash. Tells the user "got it, holding". */}
      {status === "interrupting" && !reduced && (
        <motion.div
          key="interrupt-flash"
          className="absolute inset-0"
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          style={{
            background:
              "radial-gradient(ellipse at center, oklch(0.85 0.16 60 / 0.45) 0%, transparent 60%)",
          }}
        />
      )}

      {/* ERROR — steady destructive halo, centered. */}
      <div
        className="absolute inset-0 transition-opacity duration-400 ease-out"
        style={{
          opacity: status === "error" ? 0.55 : 0,
          background:
            "radial-gradient(ellipse 95% 70% at 50% 55%, hsl(var(--destructive) / 0.50) 0%, hsl(var(--destructive) / 0.12) 35%, transparent 70%)",
        }}
      />

      {/* SCREEN-RIM GLOW — the most subtle layer. A soft inset shadow in the
          active color, breathing with the active amplitude. Reads as "the
          surface itself is alive". currentColor lets a single className flip
          swap warm / cool / destructive / primary cleanly. */}
      <motion.div
        className={cn(
          "absolute inset-0 transition-colors duration-500",
          status === "listening"
            ? "text-[oklch(0.72_0.18_35)]"
            : status === "speaking" || status === "interrupting"
              ? "text-[oklch(0.70_0.18_260)]"
              : status === "error"
                ? "text-destructive"
                : "text-primary",
        )}
        style={{
          opacity: rimOpacity,
          boxShadow: "inset 0 0 220px 60px currentColor",
        }}
      />
    </div>
  );
}
