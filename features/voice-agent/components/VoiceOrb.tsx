"use client";
// features/voice-agent/components/VoiceOrb.tsx
//
// One primitive. Five distinct states. Everything the voice surface
// needs to communicate flows through this single component.
//
// Why one component instead of three:
//   The May 2026 design (VoiceAmbientGlow + VoiceListenHalo) split user
//   and agent into "warm halo near mic" + "cool dome from above". In
//   practice the spatial metaphor reads as "two different things are
//   happening" instead of "one conversation". The gold-standard voice
//   UIs — ChatGPT Advanced Voice, Apple Intelligence Siri, Pi — all
//   land on a SINGLE primitive that modulates richly: same place, same
//   shape, state-driven hue/scale/motion. We follow them here.
//
// What this primitive is:
//   A nested SVG orb (outer bloom + middle ring + inner core) sitting
//   behind the mic button. Animations are pure motion/react. Hue, scale,
//   and motion all couple to:
//     • the current status (idle | listening | thinking | speaking | …)
//     • the relevant amplitude bus (mic OR assistant, swapped by state)
//
// State playbook (the contract every reader of this file should know):
//
//   • idle / requesting-mic / connecting  → desaturated indigo, slow
//     4 s breath, scale 0.95↔1.0. Static color. No audio input. Reads
//     "I'm here, waiting."
//   • listening                           → reactive to MIC amplitude;
//     hue stays in the primary-blue band as the user gets louder. Scale
//     0.95→1.08. Reads "I'm hearing you."
//   • thinking                            → DISCONNECTED from amplitude.
//     Continuous hue rotation through the purple→blue band on an
//     internal 1.4 s clock. This is the legible "I'm working" tell
//     that the old design was missing (thinking and connecting looked
//     identical).
//   • speaking / interrupting             → reactive to ASSISTANT
//     amplitude; cool indigo→violet. Bigger excursion (scale
//     0.95→1.15) and the outer bloom intensifies. Reads "I'm talking."
//   • error                               → static destructive ring,
//     no motion. Reads "something is wrong."
//
// Respects `prefers-reduced-motion`: amplitude binding fixes at 0.4,
// scale becomes constant, breath disabled.

import { motion, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@/lib/utils";
import { useAudioAmplitude } from "../hooks/useAudioAmplitude";
import type { VoiceStatus } from "../types";

interface VoiceOrbProps {
  status: VoiceStatus;
  /** Pixel size of the orb. Defaults to 260 — large enough to dominate the hero area. */
  size?: number;
  className?: string;
}

/**
 * Maps a status to (hue, saturation) in oklch space. Lightness stays
 * roughly constant (0.78) so the orb never dims into the background.
 *
 * Hue numbers are oklch degrees:
 *   220 — primary blue (listening — matches the active mic button)
 *   260 — indigo (idle, neutral)
 *   280 — violet (speaking)
 *   25  — destructive red (error only — kept far from listening blue)
 */
function colorForStatus(status: VoiceStatus): { hue: number; sat: number } {
  switch (status) {
    case "listening":
      return { hue: 220, sat: 0.16 };
    case "thinking":
      // Thinking shifts hue on a clock (see hueOffset below); base sits
      // in the indigo→violet band.
      return { hue: 270, sat: 0.18 };
    case "speaking":
    case "interrupting":
      return { hue: 275, sat: 0.18 };
    case "error":
      return { hue: 25, sat: 0.22 };
    case "idle":
    case "requesting-mic":
    case "connecting":
    default:
      return { hue: 260, sat: 0.1 };
  }
}

export function VoiceOrb({ status, size = 260, className }: VoiceOrbProps) {
  const reduced = useReducedMotion();
  const micAmp = useAudioAmplitude("mic");
  const assistantAmp = useAudioAmplitude("assistant");

  const isListening = status === "listening";
  const isSpeaking = status === "speaking" || status === "interrupting";
  const isThinking = status === "thinking";
  const isError = status === "error";
  const isIdleish =
    status === "idle" || status === "requesting-mic" || status === "connecting";

  // ── Amplitude routing ──────────────────────────────────────────────
  // The orb watches mic OR assistant depending on state — never both.
  // This couples one continuous channel to the visual at any time, so
  // the eye gets one clear signal instead of two competing ones.
  const activeAmp = isListening ? micAmp : isSpeaking ? assistantAmp : null;

  const ampStrength = useTransform(activeAmp ?? micAmp, (v) => {
    if (!activeAmp) return 0;
    if (reduced) return 0.4;
    return Math.min(v * 1.4, 1);
  });

  // ── Scale (core + outer bloom) ─────────────────────────────────────
  // Speaking gets bigger excursion than listening — the agent is the
  // active party so it should feel more present.
  const coreScale = useTransform(ampStrength, (s) => {
    if (reduced) return 1;
    if (isSpeaking) return 1 + s * 0.15;
    if (isListening) return 1 + s * 0.08;
    return 1;
  });
  const bloomScale = useTransform(ampStrength, (s) => {
    if (reduced) return 1.05;
    if (isSpeaking) return 1.05 + s * 0.2;
    if (isListening) return 1.05 + s * 0.12;
    return 1.05;
  });
  const bloomOpacity = useTransform(ampStrength, (s) => {
    if (isSpeaking) return 0.45 + s * 0.45;
    if (isListening) return 0.3 + s * 0.4;
    if (isThinking) return 0.45;
    if (isError) return 0.55;
    return 0.2;
  });
  // The inner core's opacity holds steadier — the bloom carries amplitude.
  const coreOpacity = useTransform(ampStrength, (s) => {
    if (isSpeaking) return 0.85 + s * 0.15;
    if (isListening) return 0.75 + s * 0.2;
    if (isThinking) return 0.85;
    if (isError) return 0.85;
    return 0.55;
  });

  const { hue, sat } = colorForStatus(status);
  // Brighter primary shimmer on listening — amplitude pushes hue toward cyan.
  const hueOffset = useTransform(ampStrength, (s) => {
    if (isListening) return s * 10;
    return 0;
  });

  // The "working" tell — only fires in `thinking` state. Subtle, never
  // attention-grabbing.
  const thinkHueShift = isThinking && !reduced ? "thinking-hue" : undefined;

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
      {/* ── Outer bloom — soft amplitude-reactive halo ──────────────── */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          opacity: bloomOpacity,
          scale: bloomScale,
          background: `radial-gradient(circle, oklch(0.82 ${sat} ${hue}) 0%, oklch(0.62 ${sat * 1.1} ${hue} / 0.45) 35%, transparent 70%)`,
          filter: "blur(14px)",
        }}
        transition={{
          scale: { type: "spring", stiffness: 240, damping: 26 },
        }}
      />

      {/* ── Inner core — the orb body itself ────────────────────────── */}
      <motion.div
        className="absolute inset-[18%] rounded-full"
        style={{
          opacity: coreOpacity,
          scale: coreScale,
          background: `radial-gradient(circle at 40% 35%, oklch(0.92 ${sat * 0.7} ${hue}) 0%, oklch(0.72 ${sat} ${hue}) 45%, oklch(0.55 ${sat * 1.2} ${hue}) 80%, transparent 100%)`,
          filter: "blur(2px)",
        }}
        transition={{
          scale: { type: "spring", stiffness: 200, damping: 24 },
        }}
        animate={
          isIdleish && !reduced ? { scale: [0.96, 1.02, 0.96] } : undefined
        }
        {...(isIdleish && !reduced
          ? {
              transition: {
                scale: {
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              },
            }
          : {})}
      />

      {/* ── Hue rotation overlay (thinking state only) ──────────────── */}
      {thinkHueShift && (
        <motion.div
          key="thinking-hue"
          className="absolute inset-[18%] rounded-full mix-blend-overlay"
          style={{
            background:
              "conic-gradient(from 0deg, oklch(0.78 0.18 260), oklch(0.78 0.18 290), oklch(0.78 0.18 320), oklch(0.78 0.18 260))",
            filter: "blur(6px)",
            opacity: 0.5,
          }}
          animate={{ rotate: 360 }}
          transition={{
            rotate: {
              duration: 4.2,
              repeat: Infinity,
              ease: "linear",
            },
          }}
        />
      )}

      {/* ── Hue offset (listening shimmer) ──────────────────────────── */}
      <motion.div
        className="absolute inset-0 rounded-full mix-blend-soft-light"
        style={{
          background:
            "radial-gradient(circle, oklch(0.92 0.14 220 / 0.5) 0%, transparent 60%)",
          opacity: isListening ? 0.6 : 0,
          rotate: hueOffset,
        }}
        transition={{ opacity: { duration: 0.4 } }}
      />

      {/* ── Error ring — replaces all motion when something fails ──── */}
      {isError && (
        <div
          className="absolute inset-[18%] rounded-full ring-2 ring-destructive/70"
          style={{
            boxShadow: "0 0 24px oklch(0.55 0.22 25 / 0.55)",
          }}
        />
      )}
    </div>
  );
}
