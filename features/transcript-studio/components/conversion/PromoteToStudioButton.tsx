"use client";

/**
 * Promote-to-studio button for a regular `transcripts` row. Inserts a new
 * studio session linked to the source transcript, migrates its segments
 * into `studio_raw_segments`, and navigates to the studio with the new
 * session active.
 *
 * Mounted from `features/transcripts/components/TranscriptViewer.tsx`.
 * Idempotent — clicking twice opens the same studio session both times.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { promoteTranscriptThunk } from "../../redux/transcriptBridge.thunks";
import type { Transcript } from "@/features/transcripts/types";

interface PromoteToStudioButtonProps {
  transcript: Transcript;
  className?: string;
  variant?: "icon" | "labeled";
}

export function PromoteToStudioButton({
  transcript,
  className,
  variant = "labeled",
}: PromoteToStudioButtonProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const result = await dispatch(
        promoteTranscriptThunk({ transcript, userId }),
      );
      if (
        promoteTranscriptThunk.fulfilled.match(result) &&
        result.payload?.sessionId
      ) {
        router.push(
          `/transcripts/studio?session=${result.payload.sessionId}`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const Icon = busy ? Loader2 : Mic;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy || !userId}
        title="Open in Transcript Studio"
        aria-label="Promote to Transcript Studio"
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
          busy
            ? "text-muted-foreground/50 cursor-wait"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          className,
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || !userId}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
        busy
          ? "bg-muted text-muted-foreground cursor-wait"
          : "bg-primary/10 text-primary hover:bg-primary/15",
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
      {busy ? "Opening studio…" : "Open in Studio"}
    </button>
  );
}
