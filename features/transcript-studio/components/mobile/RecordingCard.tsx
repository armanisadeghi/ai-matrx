"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import { selectRawSegmentsForRecording } from "../../redux/selectors";
import type { RecordingSegment } from "../../types";

interface RecordingCardProps {
  sessionId: string;
  recording: RecordingSegment;
  index: number;
  selected: boolean;
  selectionActive: boolean;
  onToggleSelect: (id: string) => void;
  onOpenTranscript: (id: string) => void;
}

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const LONG_PRESS_MS = 450;

export function RecordingCard({
  sessionId,
  recording,
  index,
  selected,
  selectionActive,
  onToggleSelect,
  onOpenTranscript,
}: RecordingCardProps) {
  const raws = useAppSelector(
    selectRawSegmentsForRecording(sessionId, recording.id),
  );
  const previewText = raws.map((r) => r.text).join(" ").trim();
  const durationSec =
    raws.length > 0
      ? raws[raws.length - 1]!.tEnd - raws[0]!.tStart
      : (recording.tEnd ?? 0) - recording.tStart;

  const audioSrc = useFileSrc(
    recording.audioPath ? { kind: "file_id", fileId: recording.audioPath } : null,
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onPointerDown = () => {
    longPressed.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      onOpenTranscript(recording.id);
    }, LONG_PRESS_MS);
  };

  const handleCardClick = () => {
    clearLongPress();
    if (longPressed.current) return; // long-press already handled
    if (selectionActive) {
      onToggleSelect(recording.id);
    } else {
      onOpenTranscript(recording.id);
    }
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
    } else {
      void el.play();
    }
  };

  const audioPending = !recording.audioPath;

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onClick={handleCardClick}
      className={cn(
        "flex w-full select-none items-stretch gap-3 rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card active:bg-accent",
      )}
    >
      {/* Selection / index badge */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(recording.id);
        }}
        aria-label={selected ? "Deselect recording" : "Select recording"}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {selected ? <Check className="h-5 w-5" /> : index + 1}
      </button>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Recording {index + 1}
          </span>
          <span aria-hidden>·</span>
          <span className="font-mono tabular-nums">
            {formatClock(durationSec)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-foreground">
          {previewText || (
            <span className="italic text-muted-foreground">
              No transcript captured
            </span>
          )}
        </p>
      </div>

      {/* Play */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={audioPending || !audioSrc}
        aria-label={isPlaying ? "Pause audio" : "Play audio"}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          audioPending || !audioSrc
            ? "bg-muted text-muted-foreground"
            : "bg-accent text-accent-foreground active:bg-accent/70",
        )}
      >
        {audioPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5" />
        )}
      </button>

      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="none"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
}
