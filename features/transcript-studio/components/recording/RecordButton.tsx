"use client";

import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudioSession } from "../../hooks/useStudioSession";
// THE package duration formatter (`@ai-matrx/kit/format`, census H1
// 2026-09-07). THE UNIT LAW: the unit is in the name, because the fleet's
// ~35 twins variously took ms, seconds and minutes behind one signature.
import { formatDurationSeconds } from "@ai-matrx/kit/format";

interface RecordButtonProps {
  sessionId: string;
  className?: string;
}

export function RecordButton({ sessionId, className }: RecordButtonProps) {
  const session = useStudioSession({ sessionId });

  const isRecording = session.isOwnedRecording;
  const blockedByOther = session.isAnyRecording && !isRecording;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={isRecording ? session.stop : session.start}
        disabled={blockedByOther}
        title={
          blockedByOther
            ? "Another recording is active. Stop it first."
            : isRecording
              ? "Stop recording"
              : "Start recording"
        }
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors",
          isRecording
            ? "bg-red-500 text-white hover:bg-red-600"
            : blockedByOther
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {isRecording ? (
          <>
            <Square className="h-3 w-3 fill-current" />
            <span className="hidden sm:inline">Stop</span>
          </>
        ) : (
          <>
            <Mic className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Record</span>
          </>
        )}
      </button>
      {isRecording && (
        <div className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px]">
          <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
            {formatDurationSeconds(session.durationSec)}
          </span>
          <span
            aria-hidden="true"
            className="block h-2 w-12 overflow-hidden rounded-sm bg-muted/40"
          >
            <span
              className="block h-full bg-red-500/80 transition-[width] duration-100"
              style={{ width: `${Math.min(100, session.audioLevel)}%` }}
            />
          </span>
        </div>
      )}
    </div>
  );
}
