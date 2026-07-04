"use client";

// features/flashcards/fast-fire/voice-test/VoiceTestButton.tsx
//
// Drop-anywhere "Test me" button — the single entry point for the single-card
// voice test. Give it a card (+ optional cached spoken-front) and it owns the
// dialog. This is what goes on ANY flashcard surface: the study deck, set detail,
// chat flashcard blocks, window panels. One import, no wiring.

import { useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicTapButton } from "@/components/icons/tap-buttons";
import { cn } from "@/lib/utils";
import { CardVoiceTestDialog } from "./CardVoiceTestDialog";

export interface VoiceTestButtonProps {
  card: { id: string; front: string; back: string };
  spokenFrontFileId?: string | null;
  answerSeconds?: number;
  label?: string;
  /** Compact mic icon — for embedding on flashcard corners. */
  iconOnly?: boolean;
  variant?: "outline" | "secondary" | "ghost" | "default";
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function VoiceTestButton({
  card,
  spokenFrontFileId,
  answerSeconds,
  label = "Test me",
  iconOnly = false,
  variant = "outline",
  size = "sm",
  className,
}: VoiceTestButtonProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = () => setOpen(true);

  return (
    <>
      {iconOnly ? (
        <MicTapButton ariaLabel={label} tooltip={label} onClick={handleOpen} />
      ) : (
        <Button
          type="button"
          variant={variant}
          size={size}
          className={cn("gap-1.5", className)}
          title={label}
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation();
            handleOpen();
          }}
        >
          <Mic className="h-4 w-4" />
          {label}
        </Button>
      )}
      <CardVoiceTestDialog
        card={card}
        spokenFrontFileId={spokenFrontFileId}
        answerSeconds={answerSeconds}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
