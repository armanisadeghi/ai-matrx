"use client";

import { TranscriptsModeController } from "@/features/transcripts/components/TranscriptsModeController";

/** Shared transcripts shell header — route nav only. */
export function TranscriptsListHeader() {
  return (
    <div className="flex w-full min-w-0 items-center justify-center px-0">
      <TranscriptsModeController />
    </div>
  );
}
