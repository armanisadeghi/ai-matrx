"use client";
// features/voice-agent/components/VoiceTranscriptStream.tsx
//
// Scrolling list of turns. Auto-scrolls to the latest entry. Uses a single
// scroll region (the rest of the surface is fixed) so motion is contained.

import { useEffect, useRef } from "react";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import type { VoiceTurn } from "../types";
import { VoiceTranscriptTurn } from "./VoiceTranscriptTurn";

interface VoiceTranscriptStreamProps {
  turns: ReadonlyArray<VoiceTurn>;
  className?: string;
}

export function VoiceTranscriptStream({
  turns,
  className,
}: VoiceTranscriptStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  return (
    <div
      className={cn(
        "max-w-2xl mx-auto px-6 py-4 w-full",
        "text-pretty",
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {turns.map((turn) => (
          <VoiceTranscriptTurn key={turn.id} turn={turn} />
        ))}
      </AnimatePresence>
      <div ref={bottomRef} className="h-1" aria-hidden="true" />
    </div>
  );
}
