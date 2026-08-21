"use client";

import { TranscriptsModeController } from "@/features/transcripts/components/TranscriptsModeController";
import { MandateDoorLink } from "@/features/agents/mandates/components/MandateDoorLink";

/** Shared transcripts shell header — route nav + THE DOOR to Scribe's agents. */
export function TranscriptsListHeader() {
  return (
    <div className="relative flex w-full min-w-0 items-center justify-center px-0">
      <TranscriptsModeController />
      <MandateDoorLink
        feature="transcript_studio"
        label="Transcript agents"
        className="absolute right-0"
      />
    </div>
  );
}
