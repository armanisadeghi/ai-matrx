"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Mic, Pause, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { useGlobalRecordingOptional } from "@/providers/GlobalRecordingProvider";

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Floating, route-persistent recording control for the Scribe section.
 *
 * The recorder itself is app-global (GlobalRecordingProvider), so a recording
 * survives navigating between the sessions list, the unsorted pool, and other
 * sessions. This pill makes that visible and controllable from anywhere in
 * Scribe: it shows the live timer + pause/stop, and tapping the body jumps back
 * to the session being recorded.
 *
 * It deliberately HIDES while you're on the recording session's own screen —
 * that screen already has the full record bar, so a second floating indicator
 * would be redundant clutter (the user's explicit ask).
 */
export function GlobalRecordingIndicator() {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const recording = useGlobalRecordingOptional();

  const isRecording = useAppSelector((s) => s.recordings.isRecording);
  const isPaused = useAppSelector((s) => s.recordings.isPaused);
  const durationSec = useAppSelector((s) => s.recordings.durationSec);
  const context = useAppSelector((s) => s.recordings.context);

  if (!recording) return null;
  if (!isRecording) return null;
  if (!context || context.kind !== "studio") return null;

  // On the recording session's own page, the in-screen record bar owns the UI.
  const onRecordingSession = pathname?.includes(context.sessionId) ?? false;
  if (onRecordingSession) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 py-1.5 pl-3 pr-1.5 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() =>
            startTransition(() =>
              router.push(`/transcripts/scribe/${context.sessionId}`),
            )
          }
          className="flex items-center gap-2 text-sm font-medium text-foreground"
          aria-label="Return to the recording session"
        >
          <span className="relative flex h-2.5 w-2.5">
            {!isPaused && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                isPaused ? "bg-muted-foreground" : "bg-red-500",
              )}
            />
          </span>
          <Mic className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono tabular-nums">
            {formatClock(durationSec)}
          </span>
          <span className="text-xs text-muted-foreground">
            {isPaused ? "Paused" : "Recording"}
          </span>
        </button>

        <button
          type="button"
          onClick={isPaused ? recording.resume : recording.pause}
          aria-label={isPaused ? "Resume recording" : "Pause recording"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground active:bg-accent"
        >
          {isPaused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={recording.stop}
          disabled={recording.isFinalizing}
          aria-label="Stop recording"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white active:scale-95 disabled:opacity-60"
        >
          {recording.isFinalizing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Square className="h-4 w-4 fill-current" />
          )}
        </button>
      </div>
    </div>
  );
}
