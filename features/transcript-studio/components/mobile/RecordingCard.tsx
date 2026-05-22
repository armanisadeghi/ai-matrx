"use client";

import { useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  Inbox,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import { selectRawSegmentsForRecording } from "../../redux/selectors";
import {
  archiveRecordingThunk,
  deleteRecordingSegmentThunk,
  detachRecordingThunk,
  restoreRecordingThunk,
} from "../../redux/thunks";
import type { RecordingSegment } from "../../types";
import { SwipeableRow, type SwipeAction } from "./SwipeableRow";

export type RecordingCardVariant = "active" | "archived" | "unsorted";

interface RecordingCardProps {
  sessionId: string;
  recording: RecordingSegment;
  index: number;
  variant?: RecordingCardVariant;
  selected?: boolean;
  selectionActive?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpenTranscript: (id: string) => void;
}

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

export function RecordingCard({
  sessionId,
  recording,
  index,
  variant = "active",
  selected = false,
  selectionActive = false,
  onToggleSelect,
  onOpenTranscript,
}: RecordingCardProps) {
  const dispatch = useAppDispatch();
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

  const finalizing = !recording.endedAt;
  const canPlay = Boolean(audioSrc);

  // Long-press → open transcript. Cancelled by movement (so a horizontal swipe
  // never also triggers the press).
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    longPressed.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      onOpenTranscript(recording.id);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = pressStart.current;
    if (!start) return;
    if (
      Math.abs(e.clientX - start.x) > MOVE_CANCEL_PX ||
      Math.abs(e.clientY - start.y) > MOVE_CANCEL_PX
    ) {
      clearLongPress();
    }
  };

  const handleCardClick = () => {
    clearLongPress();
    if (longPressed.current) return;
    if (selectionActive && onToggleSelect) {
      onToggleSelect(recording.id);
    } else {
      onOpenTranscript(recording.id);
    }
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) el.pause();
    else void el.play();
  };

  const deleteAction: SwipeAction = {
    key: "delete",
    label: "Delete",
    icon: <Trash2 className="h-5 w-5" />,
    className: "bg-destructive text-destructive-foreground",
    onAction: () =>
      void dispatch(
        deleteRecordingSegmentThunk({ sessionId, recordingSegmentId: recording.id }),
      ),
  };

  let leadingActions: SwipeAction[] = [];
  let trailingActions: SwipeAction[] = [];

  if (variant === "active") {
    leadingActions = [
      {
        key: "unsort",
        label: "Unsort",
        icon: <Inbox className="h-5 w-5" />,
        className: "bg-amber-500 text-white",
        onAction: () =>
          void dispatch(
            detachRecordingThunk({ sessionId, recordingSegmentId: recording.id }),
          ),
      },
    ];
    trailingActions = [
      {
        key: "archive",
        label: "Archive",
        icon: <Archive className="h-5 w-5" />,
        className: "bg-muted-foreground/80 text-background",
        onAction: () =>
          void dispatch(
            archiveRecordingThunk({
              sessionId,
              recordingSegmentId: recording.id,
              archived: true,
            }),
          ),
      },
      deleteAction,
    ];
  } else if (variant === "archived") {
    trailingActions = [
      {
        key: "unarchive",
        label: "Restore",
        icon: <ArchiveRestore className="h-5 w-5" />,
        className: "bg-primary text-primary-foreground",
        onAction: () =>
          void dispatch(
            archiveRecordingThunk({
              sessionId,
              recordingSegmentId: recording.id,
              archived: false,
            }),
          ),
      },
      deleteAction,
    ];
  } else {
    // unsorted
    trailingActions = [
      {
        key: "restore",
        label: "Restore",
        icon: <RotateCcw className="h-5 w-5" />,
        className: "bg-primary text-primary-foreground",
        onAction: () =>
          void dispatch(restoreRecordingThunk({ recordingSegmentId: recording.id })),
      },
      deleteAction,
    ];
  }

  return (
    <SwipeableRow
      leadingActions={leadingActions}
      trailingActions={trailingActions}
    >
      <div
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onClick={handleCardClick}
        className={cn(
          "flex w-full select-none items-stretch gap-3 border p-3 text-left",
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
            onToggleSelect?.(recording.id);
          }}
          aria-label={selected ? "Deselect recording" : "Select recording"}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
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
          disabled={!canPlay}
          aria-label={
            finalizing
              ? "Processing audio"
              : canPlay
                ? isPlaying
                  ? "Pause audio"
                  : "Play audio"
                : "Audio unavailable"
          }
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            canPlay
              ? "bg-accent text-accent-foreground active:bg-accent/70"
              : "bg-muted text-muted-foreground",
          )}
        >
          {finalizing ? (
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
    </SwipeableRow>
  );
}
