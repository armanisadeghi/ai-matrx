"use client";
// features/voice-agent/components/VoiceTranscriptTurn.tsx
//
// A single transcript line. Animates in with the user's voice or assistant's
// reply. Interrupted assistant turns dim to opacity-50 so the user feels
// where the conversation was cut off.

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { VoiceTurn } from "../types";

interface VoiceTranscriptTurnProps {
  turn: VoiceTurn;
}

export function VoiceTranscriptTurn({ turn }: VoiceTranscriptTurnProps) {
  const isUser = turn.role === "user";
  const isInterrupted = turn.status === "interrupted";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isInterrupted ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "py-2 first:pt-0 last:pb-0",
        "transition-opacity duration-200",
      )}
    >
      <p
        className={cn(
          "text-base leading-relaxed",
          isUser ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {turn.text}
        {turn.status === "pending" && (
          <span
            className="ml-1 inline-block h-4 w-[2px] -mb-0.5 bg-current align-middle opacity-60 motion-safe:animate-pulse"
            aria-hidden="true"
          />
        )}
      </p>
    </motion.div>
  );
}
