"use client";

/**
 * Save-as-transcript button for a studio session. Materializes a regular
 * `transcripts` row from the studio's raw + cleaned segments and back-links
 * via `studio_sessions.transcript_id`. Subsequent clicks update the linked
 * transcript instead of creating duplicates.
 *
 * Rendered in the studio active-session header.
 */

import { useState } from "react";
import { ArrowDownToLine, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { saveAsTranscriptThunk } from "../../redux/transcriptBridge.thunks";

interface SaveAsTranscriptButtonProps {
  sessionId: string;
  hasLinkedTranscript: boolean;
  className?: string;
  /** Icon-only chip for tight header slots; full label on larger surfaces. */
  variant?: "default" | "icon";
}

export function SaveAsTranscriptButton({
  sessionId,
  hasLinkedTranscript,
  className,
  variant = "default",
}: SaveAsTranscriptButtonProps) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await dispatch(saveAsTranscriptThunk({ sessionId }));
    } finally {
      setBusy(false);
    }
  };

  const Icon = busy ? Loader2 : ArrowDownToLine;
  const label = hasLinkedTranscript
    ? busy
      ? "Updating transcript…"
      : "Update transcript"
    : busy
      ? "Saving…"
      : "Save as Transcript";
  const title = hasLinkedTranscript
    ? "Push the latest studio state to the linked transcript"
    : "Materialize this session as a regular transcript";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors",
        variant === "icon" ? "h-7 w-7" : "h-7 gap-1 px-2",
        busy
          ? "bg-muted text-muted-foreground cursor-wait"
          : variant === "icon"
            ? "text-muted-foreground hover:bg-accent hover:text-foreground"
            : "bg-secondary/30 text-foreground hover:bg-secondary/50",
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
      {variant === "default" ? (
        <span className="hidden sm:inline">{label}</span>
      ) : null}
    </button>
  );
}
