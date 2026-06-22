"use client";
// features/voice-agent/components/VoiceStatusPill.tsx
//
// A tiny semantic label under the visualizer. Uses pure CSS for the text
// fade — text is tiny + state changes are infrequent, so motion/react is
// overkill here and historically left the span stuck at opacity:0 under
// strict mode / HMR. Pure CSS transitions are unconditionally reliable.

import { cn } from "@/lib/utils";
import type { VoiceStatus } from "../types";

interface VoiceStatusPillProps {
  status: VoiceStatus;
  /** When true during a live session, overrides the listening label. */
  micMuted?: boolean;
  className?: string;
}

const LABELS: Record<VoiceStatus, string> = {
  idle: "Tap to begin",
  "requesting-mic": "Allow microphone access",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  interrupting: "One moment",
  error: "Tap to try again",
};

export function VoiceStatusPill({
  status,
  micMuted = false,
  className,
}: VoiceStatusPillProps) {
  const text =
    micMuted &&
    (status === "listening" ||
      status === "thinking" ||
      status === "speaking" ||
      status === "interrupting")
      ? "Muted"
      : LABELS[status];
  return (
    <div
      className={cn(
        "h-6 text-sm font-medium tracking-wide text-muted-foreground",
        "flex items-center justify-center",
        status === "error" && "text-destructive",
        className,
      )}
      aria-live="polite"
    >
      <span
        key={status}
        className="transition-opacity duration-200 ease-out motion-safe:animate-in motion-safe:fade-in"
      >
        {text}
      </span>
    </div>
  );
}
