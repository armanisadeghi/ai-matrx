"use client";

/**
 * RecordingPill — a minimal, unobtrusive "recording active" indicator. Mounted
 * once in app/Providers.tsx (and app/EntityProviders.tsx) so it survives all
 * route navigations.
 *
 * Renders nothing when no recording is in flight. While recording it shows ONLY
 * a small pulsing dot + mic glyph at the top-center — NO timer, NO audio-level
 * meter, NO controls. Each recording surface owns its own stop control (the
 * Agent+ record bar, the Scribe transport, and the focused working-document
 * editor's Stop button), so this stays purely a status signal: it never obscures
 * the UI, intercepts clicks, or traps the user inside a full-screen overlay.
 *
 * Reads from `state.recordings` (Redux mirror of the global recording provider)
 * so it renders even in subtrees outside <GlobalRecordingProvider> (e.g. overlay
 * portals).
 */

import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";

export function RecordingPill() {
  const isRecording = useAppSelector(
    (state: RootState) => state.recordings.isRecording,
  );
  const isPaused = useAppSelector(
    (state: RootState) => state.recordings.isPaused,
  );
  const isTranscribing = useAppSelector(
    (state: RootState) => state.recordings.isTranscribing,
  );

  if (!isRecording && !isTranscribing) return null;

  const dotState = isPaused
    ? "paused"
    : isTranscribing && !isRecording
      ? "saving"
      : "live";
  const label =
    dotState === "paused"
      ? "Recording paused"
      : dotState === "saving"
        ? "Saving recording"
        : "Recording in progress";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        // Top-CENTER, not the corners: full-screen overlays/dialogs put their
        // close / Done controls in the top-right (and back/menu in the top-left).
        // Purely visual + pointer-events-none so it can never occlude or trap.
        "fixed top-2 left-1/2 z-[120] -translate-x-1/2 pointer-events-none",
        "flex items-center gap-1.5 rounded-full",
        "border border-border/60 bg-background/90 backdrop-blur",
        "px-2 py-1 shadow-sm select-none",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          dotState === "live" && "bg-red-500 animate-pulse",
          dotState === "paused" && "bg-amber-500",
          dotState === "saving" && "bg-blue-500 animate-pulse",
        )}
      />
      <Mic aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
