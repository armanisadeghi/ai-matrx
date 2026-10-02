"use client";
// features/voice-agent/components/VoiceMuteButton.tsx
//
// Mutes mic capture while the voice session stays connected — the agent
// can still speak; the user's audio is simply not forwarded to xAI.

import { Mic, MicOff } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface VoiceMuteButtonProps {
  muted: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
}

export function VoiceMuteButton({
  muted,
  onToggle,
  size = 64,
  className,
}: VoiceMuteButtonProps) {
  const label = muted ? "Unmute microphone" : "Mute microphone";

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full",
        "border transition-colors duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        muted
          ? "bg-muted text-muted-foreground border-border"
          : "bg-card text-foreground border-border hover:border-primary hover:text-primary",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {muted ? (
        <MicOff className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Mic className="h-5 w-5" aria-hidden="true" />
      )}
    </motion.button>
  );
}
