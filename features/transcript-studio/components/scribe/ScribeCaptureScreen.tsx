"use client";

import { useState } from "react";
import { Loader2, Mic, Pause, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { useStudioSession } from "../../hooks/useStudioSession";
import { RecordingCardList } from "./RecordingCardList";
import { FullTranscriptDrawer } from "./FullTranscriptDrawer";

interface ScribeCaptureScreenProps {
  sessionId: string;
}

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ScribeCaptureScreen({ sessionId }: ScribeCaptureScreenProps) {
  const session = useStudioSession({ sessionId });
  const liveTranscript = useAppSelector((s) => s.recordings.liveTranscript);
  const [openTranscriptId, setOpenTranscriptId] = useState<string | null>(null);

  const isRecording = session.isOwnedRecording;
  const blockedByOther = session.isAnyRecording && !isRecording;
  const level = Math.min(100, session.audioLevel);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Scrollable content: cards + live transcript */}
      <div className="flex-1 overflow-y-auto px-3 pt-3">
        {isRecording && (
          <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-red-600 dark:text-red-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              {session.isPaused ? "Paused" : "Listening…"}
            </div>
            <p className="line-clamp-4 text-sm text-foreground">
              {liveTranscript || (
                <span className="italic text-muted-foreground">
                  Speak — your words appear here as they are transcribed.
                </span>
              )}
            </p>
          </div>
        )}

        <RecordingCardList
          sessionId={sessionId}
          onOpenTranscript={setOpenTranscriptId}
        />
        <div className="h-4" />
      </div>

      {/* Fixed record bar */}
      <div className="shrink-0 border-t border-border bg-card/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {isRecording && (
          <div className="mb-2 flex items-center justify-center gap-2 text-xs">
            <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
              {formatClock(session.durationSec)}
            </span>
            <span className="text-muted-foreground">
              {session.isPaused
                ? "Paused — resume to keep the same recording"
                : "Recording"}
            </span>
          </div>
        )}
        <div className="flex items-center justify-center gap-4">
          {isRecording ? (
            <>
              {/* Pause / resume — primary while recording */}
              <button
                type="button"
                onClick={session.isPaused ? session.resume : session.pause}
                className="flex h-14 min-w-[7.5rem] items-center justify-center gap-2 rounded-full bg-muted px-5 text-base font-medium text-foreground active:bg-accent"
              >
                {session.isPaused ? (
                  <>
                    <Play className="h-5 w-5" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-5 w-5" />
                    Pause
                  </>
                )}
              </button>

              {/* Stop / finish */}
              <button
                type="button"
                onClick={session.stop}
                aria-label="Stop recording"
                className="relative flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white transition-transform active:scale-95"
              >
                {!session.isPaused && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-red-500/30"
                    style={{
                      transform: `scale(${1 + (level / 100) * 0.4})`,
                      transition: "transform 100ms ease-out",
                    }}
                  />
                )}
                <Square className="relative h-6 w-6 fill-current" />
              </button>
            </>
          ) : (
            /* Idle — big record button */
            <button
              type="button"
              onClick={session.start}
              disabled={blockedByOther || session.isFinalizing}
              aria-label={
                session.isFinalizing
                  ? "Saving previous recording"
                  : "Start recording"
              }
              className={cn(
                "flex h-20 w-20 items-center justify-center rounded-full transition-transform active:scale-95",
                blockedByOther || session.isFinalizing
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {session.isFinalizing ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </button>
          )}
        </div>
        {session.isFinalizing && !isRecording && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Saving the previous recording…
          </p>
        )}
        {blockedByOther && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Another recording is active elsewhere. Stop it first.
          </p>
        )}
      </div>

      <FullTranscriptDrawer
        sessionId={sessionId}
        recordingSegmentId={openTranscriptId}
        onClose={() => setOpenTranscriptId(null)}
      />
    </div>
  );
}
