"use client";
// features/voice-agent/components/VoiceVisualizer.tsx
//
// The centerpiece of the voice agent surface — an orb that breathes at rest,
// listens with the user's voice, and speaks with the assistant's. Composed of:
//
//   • a soft outer halo (SMIL breathing, runs on the element — survives heavy
//     re-renders, exactly like features/agents/components/messages-display/
//     assistant/BreathingOrb.tsx)
//   • a rotating outer ring that appears during connecting + thinking
//   • a glow band that blooms when the assistant first speaks
//   • a solid core whose scale is bound to mic-or-assistant amplitude via
//     motion/react MotionValues (zero React renders per frame)
//   • a small inner accent dot
//
// All colors are semantic tokens. No hardcoded hex. The component honors
// `prefers-reduced-motion` — when reduced, the orb collapses to a steady,
// quietly-pulsing core with no rotations or amplitude reactivity.

import { useMemo } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";
import type { VoiceStatus } from "../types";
import { useAudioAmplitude } from "../hooks/useAudioAmplitude";

interface VoiceVisualizerProps {
  status: VoiceStatus;
  /** Pixel diameter of the orb. Defaults to 280 (~desktop hero size). */
  size?: number;
  className?: string;
}

const KEY_SPLINES = "0.42 0 0.58 1; 0.42 0 0.58 1";

export function VoiceVisualizer({
  status,
  size = 280,
  className,
}: VoiceVisualizerProps) {
  const reduced = useReducedMotion();
  const micAmp = useAudioAmplitude("mic");
  const assistantAmp = useAudioAmplitude("assistant");

  // The active amplitude source flips based on status:
  //   • listening  → mic
  //   • speaking   → assistant
  //   • everything else → none (collapses to default)
  // We don't gate with React state — the MotionValue updates are zero-cost on
  // the React side, so we just bind both and let `useTransform` pick.
  const coreScale = useTransform(
    [micAmp, assistantAmp] as const,
    ([m, a]) => {
      if (reduced) return 1;
      if (status === "speaking") {
        return 1 + Math.min(a, 1) * 0.18;
      }
      if (status === "listening") {
        return 1 + Math.min(m, 1) * 0.14;
      }
      return 1;
    },
  );
  const coreGlow = useTransform(
    [micAmp, assistantAmp] as const,
    ([m, a]) => {
      if (reduced) return 8;
      if (status === "speaking") return 16 + Math.min(a, 1) * 32;
      if (status === "listening") return 6 + Math.min(m, 1) * 24;
      return 8;
    },
  );

  // Color tier driven by status. We use Tailwind utility classes on the
  // wrapping <svg>, then `fill="currentColor"` / `stroke="currentColor"`
  // inside so a single class flip recolors the whole orb.
  const colorClass = useMemo(() => {
    if (status === "error") return "text-destructive";
    if (status === "idle") return "text-muted-foreground";
    if (status === "requesting-mic") return "text-muted-foreground";
    return "text-primary";
  }, [status]);

  // The status-driven breathing tempo. SMIL handles the actual animation;
  // we just pick the cycle duration to match the mood.
  const breathDuration =
    status === "thinking" ? "1.8s" : status === "speaking" ? "2.2s" : "3.4s";
  const breathOpacityValues =
    status === "speaking"
      ? "0.8;1;0.8"
      : status === "thinking"
        ? "0.6;0.95;0.6"
        : status === "idle"
          ? "0.45;0.85;0.45"
          : "0.55;0.9;0.55";

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center select-none",
        colorClass,
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={ariaForStatus(status)}
      role="img"
    >
      {/* ─── Rotating outer ring (connecting + thinking) ─────────────── */}
      <AnimatePresence>
        {(status === "connecting" || status === "thinking") && !reduced && (
          <motion.svg
            key="ring"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{
              opacity: 1,
              scale: 1,
              rotate: status === "connecting" ? 360 : -360,
            }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{
              opacity: { duration: 0.45 },
              scale: { duration: 0.45 },
              rotate: {
                duration: status === "connecting" ? 7 : 18,
                ease: "linear",
                repeat: Infinity,
              },
            }}
            className="absolute inset-0 text-primary/40"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.7"
              strokeDasharray="2 6"
              strokeLinecap="round"
            />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.4"
              strokeOpacity="0.5"
            />
          </motion.svg>
        )}
      </AnimatePresence>

      {/* ─── Bloom flash (one-shot on entering 'speaking' and 'interrupting') ─ */}
      <AnimatePresence>
        {(status === "speaking" || status === "interrupting") && !reduced && (
          <motion.div
            key={`bloom-${status}`}
            initial={{ scale: 0.6, opacity: 0.6 }}
            animate={{ scale: 1.35, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: status === "interrupting" ? 0.22 : 0.9 }}
            className={cn(
              "absolute inset-0 rounded-full",
              status === "interrupting"
                ? "bg-primary/35"
                : "bg-primary/20",
            )}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* ─── Main orb SVG ───────────────────────────────────────────── */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="relative"
      >
        <defs>
          <radialGradient id="voice-orb-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
            <stop offset="60%" stopColor="currentColor" stopOpacity="0.08" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="voice-orb-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="70%" stopColor="currentColor" stopOpacity="0.92" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.7" />
          </radialGradient>
        </defs>

        {/* Soft outer halo — always breathing */}
        <circle cx="50" cy="50" r="40" fill="url(#voice-orb-halo)">
          {!reduced && (
            <>
              <animate
                attributeName="r"
                values="36;42;36"
                dur={breathDuration}
                calcMode="spline"
                keySplines={KEY_SPLINES}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values={breathOpacityValues}
                dur={breathDuration}
                calcMode="spline"
                keySplines={KEY_SPLINES}
                repeatCount="indefinite"
              />
            </>
          )}
        </circle>
      </svg>

      {/* ─── Amplitude-bound core (motion/react) ───────────────────── */}
      <motion.div
        className={cn(
          "absolute rounded-full",
          status === "error" ? "bg-destructive" : "bg-primary",
        )}
        style={{
          width: size * 0.36,
          height: size * 0.36,
          scale: coreScale,
          filter: useTransform(coreGlow, (g) => `drop-shadow(0 0 ${g}px currentColor)`),
        }}
        aria-hidden="true"
      />

      {/* ─── Inner accent dot — gentle SMIL pulse, mirrors core but offset ── */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      >
        <circle cx="50" cy="50" r="3.2" fill="url(#voice-orb-core)">
          {!reduced && (
            <animate
              attributeName="opacity"
              values="0.6;1;0.6"
              dur={breathDuration}
              calcMode="spline"
              keySplines={KEY_SPLINES}
              repeatCount="indefinite"
              begin="0.2s"
            />
          )}
        </circle>
      </svg>
    </div>
  );
}

function ariaForStatus(status: VoiceStatus): string {
  switch (status) {
    case "idle":
      return "Voice agent ready";
    case "requesting-mic":
      return "Requesting microphone access";
    case "connecting":
      return "Connecting to voice agent";
    case "listening":
      return "Listening";
    case "thinking":
      return "Thinking";
    case "speaking":
      return "Speaking";
    case "interrupting":
      return "Interrupted";
    case "error":
      return "Voice agent error";
  }
}
