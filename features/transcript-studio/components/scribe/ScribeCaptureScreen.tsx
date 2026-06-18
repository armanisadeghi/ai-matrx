"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  FileText,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { useStudioSession } from "../../hooks/useStudioSession";
import { selectRecordingSegmentCount } from "../../redux/selectors";
import { RecordingCardList } from "./RecordingCardList";
import {
  FullTranscriptDrawer,
  type TranscriptSection,
} from "./FullTranscriptDrawer";
import {
  SessionTranscriptViewer,
  type SessionTranscriptMode,
} from "./SessionTranscriptViewer";

interface ScribeCaptureScreenProps {
  sessionId: string;
}

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Live incoming transcript — a fixed-height scrollable region that sticks to
 * the bottom as new text streams in, but lets the user scroll up to re-read
 * without being yanked back down. Replaces the old line-clamped red box.
 */
function LiveTranscriptBox({
  text,
  paused,
}: {
  text: string;
  paused: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <div className="mb-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="relative flex h-2 w-2">
          {!paused && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              paused ? "bg-muted-foreground" : "bg-red-500",
            )}
          />
        </span>
        {paused ? "Paused" : "Listening…"}
      </div>
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground"
      >
        {text || (
          <span className="italic text-muted-foreground">
            Speak — your words appear here as they are transcribed.
          </span>
        )}
      </div>
    </div>
  );
}

export function ScribeCaptureScreen({ sessionId }: ScribeCaptureScreenProps) {
  // Scribe = WHOLE-recording model (see useStudioSession): chunks are live
  // preview only; the complete recording is transcribed once on stop.
  const session = useStudioSession({ sessionId, mode: "whole" });
  const liveTranscript = useAppSelector((s) => s.recordings.liveTranscript);
  const [openTranscript, setOpenTranscript] = useState<{
    id: string;
    section: TranscriptSection;
  } | null>(null);
  const [sessionViewer, setSessionViewer] =
    useState<SessionTranscriptMode | null>(null);
  const recordingCount = useAppSelector(selectRecordingSegmentCount(sessionId));
  const hasRecordings = recordingCount > 0;

  const isRecording = session.isOwnedRecording;
  const blockedByOther = session.isAnyRecording && !isRecording;
  const level = Math.min(100, session.audioLevel);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Scrollable content: cards + live transcript */}
      <div className="flex-1 overflow-y-auto px-3 pt-3">
        {isRecording && (
          <LiveTranscriptBox text={liveTranscript} paused={session.isPaused} />
        )}

        <RecordingCardList
          sessionId={sessionId}
          onOpenTranscript={(id, section = "raw") =>
            setOpenTranscript({ id, section })
          }
        />
        <div className="h-4" />
      </div>

      {/* Fixed record bar */}
      <div className="shrink-0 border-t border-border bg-card/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {/* Status line — always present so nothing shifts; dimmed when idle. */}
        <div
          className={cn(
            "mb-2 flex items-center justify-center gap-2 text-xs transition-opacity",
            isRecording ? "opacity-100" : "opacity-40",
          )}
        >
          <span className="relative flex h-2 w-2">
            {isRecording && !session.isPaused && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                isRecording ? "bg-red-500" : "bg-muted-foreground",
              )}
            />
          </span>
          <span className="font-mono tabular-nums text-foreground">
            {formatClock(session.durationSec)}
          </span>
          <span className="text-muted-foreground">
            {isRecording
              ? session.isPaused
                ? "Paused"
                : "Recording"
              : "Ready"}
          </span>
        </div>

        {/* Controls — All raw · start/stop · pause · All clean. Every control is
            ALWAYS rendered; inactive ones are dimmed, never removed, so the row
            never shifts or re-flows between states. */}
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          {/* All raw */}
          <button
            type="button"
            onClick={() => setSessionViewer("raw")}
            disabled={!hasRecordings}
            aria-label="View all raw transcripts"
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/60 text-foreground transition active:bg-accent",
              !hasRecordings && "pointer-events-none opacity-40",
            )}
          >
            <FileText className="h-5 w-5" />
          </button>

          {/* Start / stop — primary */}
          <button
            type="button"
            onClick={isRecording ? session.stop : session.start}
            disabled={!isRecording && (blockedByOther || session.isFinalizing)}
            aria-label={
              isRecording
                ? "Stop recording"
                : session.isFinalizing
                  ? "Saving previous recording"
                  : "Start recording"
            }
            className={cn(
              "relative flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-95",
              isRecording
                ? "bg-red-500 text-white"
                : blockedByOther || session.isFinalizing
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
              <Square className="relative h-6 w-6 fill-current" />
            ) : session.isFinalizing ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Mic className="h-7 w-7" />
            )}
          </button>

          {/* Pause / resume — same size & shape as start/stop, icon only.
              Always present; dimmed + inert when not recording. */}
          <button
            type="button"
            onClick={session.isPaused ? session.resume : session.pause}
            disabled={!isRecording}
            aria-label={
              session.isPaused ? "Resume recording" : "Pause recording"
            }
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full bg-muted text-foreground transition active:bg-accent",
              !isRecording && "pointer-events-none opacity-40",
            )}
          >
            {session.isPaused ? (
              <Play className="h-6 w-6" />
            ) : (
              <Pause className="h-6 w-6" />
            )}
          </button>

          {/* All clean */}
          <button
            type="button"
            onClick={() => setSessionViewer("clean")}
            disabled={!hasRecordings}
            aria-label="View all clean transcripts"
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary transition active:bg-primary/20",
              !hasRecordings && "pointer-events-none opacity-40",
            )}
          >
            <AlignLeft className="h-5 w-5" />
          </button>
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
        recordingSegmentId={openTranscript?.id ?? null}
        initialSection={openTranscript?.section ?? "raw"}
        onClose={() => setOpenTranscript(null)}
      />

      {sessionViewer && (
        <SessionTranscriptViewer
          sessionId={sessionId}
          mode={sessionViewer}
          open={sessionViewer !== null}
          onClose={() => setSessionViewer(null)}
          allowRefresh
        />
      )}
    </div>
  );
}
