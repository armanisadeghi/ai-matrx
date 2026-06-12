"use client";

/**
 * RecordingPill — a fixed-position indicator that appears any time a global
 * recording is active. Mounted once in app/Providers.tsx so it survives all
 * route navigations.
 *
 * Renders nothing when no recording is in flight. While recording, it shows:
 *   ● recording — 12:34   [stop]
 *
 * The pill reads from `state.recordings` (Redux mirror of the global
 * recording provider) so it can render even in subtrees that don't sit
 * under <GlobalRecordingProvider> (e.g., overlay portals).
 */

import { Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { useGlobalRecording } from "@/providers/GlobalRecordingProvider";
import type { RootState } from "@/lib/redux/store";

function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "0:00";
  const sec = Math.floor(totalSec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}:${s.toString().padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${mm.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

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
  const durationSec = useAppSelector(
    (state: RootState) => state.recordings.durationSec,
  );
  const audioLevel = useAppSelector(
    (state: RootState) => state.recordings.audioLevel,
  );
  const recording = useGlobalRecording();

  if (!isRecording && !isTranscribing) return null;

  const dotState = isPaused
    ? "paused"
    : isTranscribing && !isRecording
      ? "saving"
      : "live";
  const label =
    dotState === "paused"
      ? "paused"
      : dotState === "saving"
        ? "saving…"
        : "recording";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        // Top-CENTER, not the corners: full-screen overlays/dialogs put their
        // close / Done controls in the top-right (and back/menu in the top-left).
        // A corner-anchored pill at this z-index occludes those and traps the
        // user inside the overlay (e.g. the focused working-document editor).
        "fixed top-2 left-1/2 z-[120] -translate-x-1/2",
        "flex items-center gap-2 rounded-full",
        "border border-border/60 bg-background/90 backdrop-blur",
        "px-2.5 py-1 text-xs font-medium shadow-sm",
        "select-none",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-block h-2 w-2 rounded-full",
          dotState === "live" && "bg-red-500 animate-pulse",
          dotState === "paused" && "bg-amber-500",
          dotState === "saving" && "bg-blue-500 animate-pulse",
        )}
      />
      <span className="text-foreground">{label}</span>
      <span className="font-mono tabular-nums text-muted-foreground">
        {formatDuration(durationSec)}
      </span>
      {dotState === "live" && (
        <span
          aria-hidden="true"
          className="h-3 w-6 overflow-hidden rounded-sm bg-muted/60"
          title="Audio level"
        >
          <span
            className="block h-full bg-red-500/80 transition-[width] duration-100"
            style={{ width: `${Math.min(100, audioLevel)}%` }}
          />
        </span>
      )}
      {isRecording && (
        <button
          type="button"
          onClick={recording.stop}
          aria-label="Stop recording"
          className={cn(
            "ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full",
            "bg-red-500 text-white transition-colors hover:bg-red-600",
          )}
        >
          <Square className="h-2.5 w-2.5 fill-current" />
        </button>
      )}
    </div>
  );
}
