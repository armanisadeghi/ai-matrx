"use client";

import { useState } from "react";
import { Mic, Pause, Play, Sparkles, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { useStudioSession } from "../../hooks/useStudioSession";
import { RecordingCardList } from "./RecordingCardList";
import { FullTranscriptDrawer } from "./FullTranscriptDrawer";

interface MobileCaptureScreenProps {
  sessionId: string;
  onOpenAssistant: () => void;
}

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MobileCaptureScreen({
  sessionId,
  onOpenAssistant,
}: MobileCaptureScreenProps) {
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
        <div className="flex items-center justify-between gap-4">
          {/* Pause/resume (only while recording) */}
          <div className="flex w-16 justify-start">
            {isRecording && (
              <button
                type="button"
                onClick={session.isPaused ? session.resume : session.pause}
                aria-label={session.isPaused ? "Resume" : "Pause"}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground active:bg-accent"
              >
                {session.isPaused ? (
                  <Play className="h-5 w-5" />
                ) : (
                  <Pause className="h-5 w-5" />
                )}
              </button>
            )}
          </div>

          {/* Big record / stop button with audio-reactive ring */}
          <button
            type="button"
            onClick={isRecording ? session.stop : session.start}
            disabled={blockedByOther}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            className={cn(
              "relative flex h-20 w-20 items-center justify-center rounded-full transition-transform active:scale-95",
              isRecording
                ? "bg-red-500 text-white"
                : blockedByOther
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground",
            )}
          >
            {isRecording && !session.isPaused && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-red-500/30"
                style={{
                  transform: `scale(${1 + (level / 100) * 0.4})`,
                  transition: "transform 100ms ease-out",
                }}
              />
            )}
            {isRecording ? (
              <Square className="relative h-7 w-7 fill-current" />
            ) : (
              <Mic className="relative h-8 w-8" />
            )}
          </button>

          {/* Assistant entry / duration */}
          <div className="flex w-16 justify-end">
            {isRecording ? (
              <span className="font-mono text-sm tabular-nums text-red-600 dark:text-red-400">
                {formatClock(session.durationSec)}
              </span>
            ) : (
              <button
                type="button"
                onClick={onOpenAssistant}
                aria-label="Open assistant"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground active:bg-accent"
              >
                <Sparkles className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
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
