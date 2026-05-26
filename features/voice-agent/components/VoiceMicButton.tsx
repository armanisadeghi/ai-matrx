"use client";
// features/voice-agent/components/VoiceMicButton.tsx
//
// The single primary control. Tap to start a session, tap again to end. The
// status changes its appearance — there is no separate connect/disconnect
// button. Disabled only while a request to the OS is pending (mic permission
// dialog).

import { Loader2, Mic, MicOff } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { VoiceStatus } from "../types";

interface VoiceMicButtonProps {
  status: VoiceStatus;
  onToggle: () => void;
  size?: number;
}

export function VoiceMicButton({
  status,
  onToggle,
  size = 88,
}: VoiceMicButtonProps) {
  const isActive =
    status === "listening" ||
    status === "thinking" ||
    status === "speaking" ||
    status === "interrupting";
  const isBusy = status === "requesting-mic" || status === "connecting";
  const isError = status === "error";

  const label = ariaForStatus(status, isActive);

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      disabled={status === "requesting-mic"}
      aria-label={label}
      title={label}
      whileHover={{ scale: status === "requesting-mic" ? 1 : 1.04 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full",
        "border transition-colors duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed",
        isError
          ? "bg-destructive text-destructive-foreground border-destructive shadow-[0_0_28px_rgba(239,68,68,0.35)]"
          : isActive
            ? "bg-primary text-primary-foreground border-primary shadow-[0_0_36px_rgba(59,130,246,0.45)]"
            : "bg-card text-foreground border-border hover:border-primary hover:text-primary",
      )}
      style={{ width: size, height: size }}
    >
      {/* Pulsing ring while listening — gentle, never frantic */}
      {status === "listening" && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border border-primary/50 motion-safe:animate-ping"
        />
      )}
      {isBusy ? (
        <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
      ) : isActive ? (
        <MicOff className="h-7 w-7" aria-hidden="true" />
      ) : (
        <Mic className="h-7 w-7" aria-hidden="true" />
      )}
    </motion.button>
  );
}

function ariaForStatus(status: VoiceStatus, isActive: boolean): string {
  if (status === "requesting-mic") return "Waiting for microphone permission";
  if (status === "connecting") return "Connecting…";
  if (isActive) return "Stop voice session";
  if (status === "error") return "Retry voice session";
  return "Start voice session";
}
