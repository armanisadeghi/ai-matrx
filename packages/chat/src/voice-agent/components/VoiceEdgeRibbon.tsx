"use client";
// features/voice-agent/components/VoiceEdgeRibbon.tsx
//
// A wraparound border around the voice surface that pulses with the
// active conversation state. Visible only when the agent is actively
// listening or speaking — never in idle/thinking — so its appearance
// itself is a signal that "the AI has taken over the surface."
//
// Visually modeled on Apple Intelligence's screen-edge glow (iOS 18+):
// two stacked strokes around a rounded-rect path, the outer one
// heavily blurred. We use animated CSS background-position on a
// multi-stop linear-gradient instead of a Metal shader; in practice
// this is indistinguishable from Apple's effect and ships in 60 lines
// of TS + CSS.
//
// Drops in alongside (not inside) the VoiceOrb. Together they form a
// two-layer language:
//   • Orb     = identity, focal point, state machine readable from
//               the mic button outward.
//   • Ribbon  = "the surface is alive" presence cue, peripheral
//               vision. Only on during active turns.
//
// Respects prefers-reduced-motion: gradient stops stop drifting, the
// blur layer fades to static, the colored stroke holds without
// animation. The cue stays legible without motion.

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { VoiceStatus } from "../types";

interface VoiceEdgeRibbonProps {
  status: VoiceStatus;
  className?: string;
}

/**
 * Gradient stops chosen to match the orb's hue band for the same state.
 * Listening = primary blue (aligned with the active mic button — never
 * warm peach, which reads as warning/error in enterprise UI). Speaking =
 * cool indigo/violet. The two ends of the gradient share a hue with the
 * orb's center, so a user glancing peripherally sees "the same color as
 * the thing I'm looking at."
 */
const STOPS: Record<"primary" | "cool" | "neutral", string> = {
  primary:
    "oklch(0.82 0.14 220), oklch(0.78 0.16 210), oklch(0.74 0.18 235), oklch(0.78 0.16 210), oklch(0.82 0.14 220)",
  cool: "oklch(0.78 0.18 260), oklch(0.72 0.20 280), oklch(0.68 0.22 300), oklch(0.72 0.20 280), oklch(0.78 0.18 260)",
  neutral: "oklch(0.80 0.14 280), oklch(0.78 0.16 260), oklch(0.80 0.14 280)",
};

function paletteForStatus(status: VoiceStatus): "primary" | "cool" | "neutral" {
  if (status === "listening") return "primary";
  if (status === "speaking" || status === "interrupting") return "cool";
  return "neutral";
}

function isActiveStatus(status: VoiceStatus): boolean {
  return (
    status === "listening" || status === "speaking" || status === "interrupting"
  );
}

export function VoiceEdgeRibbon({ status, className }: VoiceEdgeRibbonProps) {
  const reduced = useReducedMotion();
  const visible = isActiveStatus(status);
  const palette = paletteForStatus(status);
  const stops = STOPS[palette];

  return (
    <motion.div
      className={cn(
        "pointer-events-none fixed inset-2 rounded-2xl",
        "transition-opacity duration-500 ease-out",
        className,
      )}
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden="true"
    >
      {/* ── Outer halo — heavily blurred, gives the ribbon its glow ─ */}
      <motion.div
        className="absolute inset-0 rounded-2xl"
        style={{
          // 6px stroke that's then blurred to ~16px of soft halo.
          padding: "6px",
          backgroundImage: `linear-gradient(110deg, ${stops})`,
          backgroundSize: "300% 100%",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "0% 50%",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          filter: "blur(10px)",
          opacity: 0.55,
        }}
        animate={
          reduced
            ? undefined
            : {
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              }
        }
        transition={{
          backgroundPosition: {
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          },
        }}
      />

      {/* ── Inner stroke — crisp 1.5 px border for definition ─────── */}
      <motion.div
        className="absolute inset-0 rounded-2xl"
        style={{
          padding: "1.5px",
          backgroundImage: `linear-gradient(110deg, ${stops})`,
          backgroundSize: "300% 100%",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "0% 50%",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          opacity: 0.85,
        }}
        animate={
          reduced
            ? undefined
            : {
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              }
        }
        transition={{
          backgroundPosition: {
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
            // Subtle 0.25 s offset from the halo creates the "follow-
            // through" feel — Rauno's "Disney follow-through" rule.
            delay: 0.25,
          },
        }}
      />
    </motion.div>
  );
}
