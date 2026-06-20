"use client";

import { useRef, useState } from "react";
import {
  AlignLeft,
  Archive,
  ArchiveRestore,
  Check,
  FileText,
  Inbox,
  Loader2,
  MoreHorizontal,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { requestScribeAudioSeek } from "../../state/scribeAudioBus";
import {
  selectCleanedSegmentForRecording,
  selectRawSegmentsForRecording,
} from "../../redux/selectors";
import {
  archiveRecordingThunk,
  deleteRecordingSegmentThunk,
  detachRecordingThunk,
  restoreRecordingThunk,
} from "../../redux/thunks";
import type { RecordingSegment } from "../../types";
import { ActionSheet, type ActionSheetItem } from "./ActionSheet";
import { SwipeableRow, type SwipeAction } from "./SwipeableRow";
import type { TranscriptSection } from "./FullTranscriptDrawer";

export type RecordingCardVariant = "active" | "archived" | "unsorted";

interface RecordingCardProps {
  sessionId: string;
  recording: RecordingSegment;
  index: number;
  variant?: RecordingCardVariant;
  selected?: boolean;
  selectionActive?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpenTranscript: (id: string, section?: TranscriptSection) => void;
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
  const cleanedSeg = useAppSelector(
    selectCleanedSegmentForRecording(sessionId, recording.id),
  );
  // Duration: once finalized, the recording's tEnd is the recorder's wall-clock
  // length — the ground truth. Don't derive it from the raw segments' span:
  // those depend on per-chunk timing (and a single out-of-range chunk made the
  // [last].tEnd − [0].tStart math collapse to ~7s). Fall back to the raw span
  // (min→max, order-independent) only while still recording (tEnd not set yet).
  const durationSec =
    recording.tEnd != null
      ? recording.tEnd - recording.tStart
      : raws.length > 0
        ? Math.max(...raws.map((r) => r.tEnd)) -
          Math.min(...raws.map((r) => r.tStart))
        : 0;

  const [menuOpen, setMenuOpen] = useState(false);

  const uploading = useAppSelector((s) =>
    s.transcriptStudio.uploadingRecordingIds.includes(recording.id),
  );
  const finalizing = !recording.endedAt;
  const busy = finalizing || uploading;
  const canPlay = Boolean(recording.audioPath) && !busy;
  // Auto-clean runs in the background on stop and can silently miss (network,
  // empty raw race, agent failure). Surface it so a miss is visible + fixable.
  const needsCleaning =
    variant === "active" &&
    !busy &&
    previewText.length > 0 &&
    !(cleanedSeg?.text?.trim());

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

  // Playback is owned by the one shared SessionAudioPlayer (mounted at the
  // ScribeScreen level), so a card tap seeks the session timeline to this
  // recording's start — and the user gets full scrub / ±10s / speed there,
  // which the old per-card hidden <audio> never offered.
  const playInSession = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canPlay) return;
    requestScribeAudioSeek({
      sessionId,
      sessionSeconds: recording.tStart,
      autoplay: true,
    });
  };

  // ── Action handlers (shared by swipe actions and the More sheet) ──
  const doArchive = (archived: boolean) =>
    void dispatch(
      archiveRecordingThunk({
        sessionId,
        recordingSegmentId: recording.id,
        archived,
      }),
    );
  const doUnsort = () =>
    void dispatch(
      detachRecordingThunk({ sessionId, recordingSegmentId: recording.id }),
    );
  const doRestore = () =>
    void dispatch(restoreRecordingThunk({ recordingSegmentId: recording.id }));
  const doDelete = () =>
    void dispatch(
      deleteRecordingSegmentThunk({ sessionId, recordingSegmentId: recording.id }),
    );

  const deleteAction: SwipeAction = {
    key: "delete",
    label: "Delete",
    icon: <Trash2 className="h-5 w-5" />,
    className: "bg-destructive text-destructive-foreground",
    onAction: doDelete,
  };
  const moreAction: SwipeAction = {
    key: "more",
    label: "More",
    icon: <MoreHorizontal className="h-5 w-5" />,
    className: "bg-muted text-foreground",
    onAction: () => setMenuOpen(true),
  };
  // Swipe-right → view content. Raw and Clean land on the matching section of
  // the recording's drawer.
  const rawAction: SwipeAction = {
    key: "raw",
    label: "Raw",
    icon: <FileText className="h-5 w-5" />,
    className: "bg-muted-foreground/80 text-background",
    onAction: () => onOpenTranscript(recording.id, "raw"),
  };
  const cleanAction: SwipeAction = {
    key: "clean",
    label: "Clean",
    icon: <AlignLeft className="h-5 w-5" />,
    className: "bg-primary text-primary-foreground",
    onAction: () => onOpenTranscript(recording.id, "clean"),
  };

  let leadingActions: SwipeAction[] = [];
  let trailingActions: SwipeAction[] = [];
  const sheetItems: ActionSheetItem[] = [
    {
      key: "view-raw",
      label: "View raw transcript",
      icon: <FileText className="h-4 w-4" />,
      onSelect: () => onOpenTranscript(recording.id, "raw"),
    },
    {
      key: "view-clean",
      label: "View clean transcript",
      icon: <AlignLeft className="h-4 w-4" />,
      onSelect: () => onOpenTranscript(recording.id, "clean"),
    },
  ];

  if (variant === "active") {
    // Swipe-right reveals Raw + Clean (view); swipe-left reveals More + Delete
    // (manage — Archive/Unsort live in the More sheet).
    leadingActions = [rawAction, cleanAction];
    trailingActions = [moreAction, deleteAction];
    sheetItems.push(
      {
        key: "archive",
        label: "Archive",
        description: "Hide from this session, recover later",
        icon: <Archive className="h-4 w-4" />,
        onSelect: () => doArchive(true),
      },
      {
        key: "unsort",
        label: "Unsort",
        description: "Move to the global Unsorted pool",
        icon: <Inbox className="h-4 w-4" />,
        onSelect: doUnsort,
      },
    );
  } else if (variant === "archived") {
    leadingActions = [
      {
        key: "unarchive",
        label: "Restore",
        icon: <ArchiveRestore className="h-5 w-5" />,
        className: "bg-primary text-primary-foreground",
        onAction: () => doArchive(false),
      },
    ];
    trailingActions = [moreAction, deleteAction];
    sheetItems.push({
      key: "unarchive",
      label: "Restore to session",
      icon: <ArchiveRestore className="h-4 w-4" />,
      onSelect: () => doArchive(false),
    });
  } else {
    // unsorted
    leadingActions = [
      {
        key: "restore",
        label: "Restore",
        icon: <RotateCcw className="h-5 w-5" />,
        className: "bg-primary text-primary-foreground",
        onAction: doRestore,
      },
    ];
    trailingActions = [moreAction, deleteAction];
    sheetItems.push({
      key: "restore",
      label: "Restore to session",
      icon: <RotateCcw className="h-4 w-4" />,
      onSelect: doRestore,
    });
  }

  sheetItems.push({
    key: "delete",
    label: "Delete",
    description: "Permanently remove audio and transcript",
    icon: <Trash2 className="h-4 w-4" />,
    destructive: true,
    onSelect: doDelete,
  });

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
            {uploading && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <span aria-hidden>·</span>
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving audio
              </span>
            )}
            {needsCleaning && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTranscript(recording.id, "clean");
                }}
                className="flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 active:bg-amber-500/25 dark:text-amber-400"
              >
                <AlignLeft className="h-3 w-3" />
                Needs cleaning
              </button>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-foreground">
            {previewText || (
              <span className="italic text-muted-foreground">
                No transcript captured
              </span>
            )}
          </p>
        </div>

        {/* Overflow menu — the non-swipe path. Swipe is great on touch, but on
            desktop a mouse-drag swipe is awkward, so every action is also one
            tap away here (opens the same sheet the swipe "More" does). */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(true);
          }}
          aria-label="Recording options"
          className="flex h-10 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>

        {/* Play in the shared session player */}
        <button
          type="button"
          onClick={playInSession}
          disabled={!canPlay}
          aria-label={
            busy ? "Saving audio" : canPlay ? "Play audio" : "Audio unavailable"
          }
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            canPlay
              ? "bg-accent text-accent-foreground active:bg-accent/70"
              : "bg-muted text-muted-foreground",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </button>
      </div>

      <ActionSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={`Recording ${index + 1}`}
        items={sheetItems}
      />
    </SwipeableRow>
  );
}
