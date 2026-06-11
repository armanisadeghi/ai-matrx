"use client";

import { Mic } from "lucide-react";
import { TranscriptsModeController } from "@/features/transcripts/components/TranscriptsModeController";

/** List-page header — title | route nav. Sort + count live in the body. */
export function TranscriptsListHeader() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-0 px-0">
      <div className="flex items-center gap-2 justify-self-start">
        <Mic className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">
          Transcripts
        </span>
      </div>

      <TranscriptsModeController />

      <div className="justify-self-end" aria-hidden="true" />
    </div>
  );
}
