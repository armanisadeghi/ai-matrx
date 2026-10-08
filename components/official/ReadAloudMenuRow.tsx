"use client";

/**
 * "Read aloud" — the first row of ProInput's "…" menu. Speaks the box's own
 * text through THE one TTS entry point (`speak()` → the single playback queue,
 * the user's saved voice, the Media panel row). ProTextarea's menu gets the
 * same act from the action registry (`tts-play`); ProInput's menu is
 * hand-built, so it carries this row. Never a second TTS path.
 */

import { Volume2 } from "lucide-react";
import { primeAudioOutput } from "@ai-matrx/media/speech";
import { toast } from "@/lib/toast";

export interface ReadAloudMenuRowProps {
  text: string;
  /** Called after the row runs (the host closes its popover). */
  onDone: () => void;
}

export async function readTextAloud(text: string): Promise<void> {
  if (!text.trim()) return;
  try {
    const { speak } = await import("@ai-matrx/media/speech");
    speak({ text, label: "Read aloud" });
  } catch (error) {
    toast.error("Could not read this aloud", {
      description: error instanceof Error ? error.message : undefined,
    });
  }
}

export function ReadAloudMenuRow({ text, onDone }: ReadAloudMenuRowProps) {
  if (!text.trim()) return null;
  return (
    <button
      type="button"
      onClick={() => {
        // The click is the gesture iOS needs — unlock output before any await.
        primeAudioOutput();
        onDone();
        void readTextAloud(text);
      }}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Volume2 className="h-4 w-4 text-primary" />
      Read aloud
    </button>
  );
}
