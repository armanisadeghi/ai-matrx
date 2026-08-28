"use client";

/**
 * ItemSwipeRow — the ONE gesture-enabled item row, shared by the in-capture
 * ItemsSheet and the /all page's mobile list so the two can never drift.
 *
 * Gestures (iOS conventions):
 * - tap        → the host's primary open action
 * - swipe RIGHT (leading reveal) → the host's positive action
 * - swipe LEFT  (trailing reveal) → Delete
 * - long-press → the host's action drawer (all actions)
 */

import React from "react";
import { Camera, FileAudio, Loader2, Trash2, Video } from "lucide-react";

import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { cn } from "@/lib/utils";

import { SwipeableRow, type SwipeRowAction } from "./SwipeableRow";
import { useLongPress } from "../hooks/useLongPress";

export interface ItemRowSummary {
  id: string;
  code: string | null;
  notes: string;
  createdAt: string;
  photoCount: number;
  videoCount: number;
  audioCount: number;
  firstPhotoFileId: string | null;
  /** Human status label (e.g. "Ready") — omit to hide. */
  statusLabel?: string;
}

export function ItemSwipeRow({
  row,
  onTap,
  leading,
  onDelete,
  onLongPress,
  isCurrent = false,
  busy = false,
  disabled = false,
}: {
  row: ItemRowSummary;
  onTap: () => void;
  /** The swipe-RIGHT (positive) action. */
  leading: SwipeRowAction;
  onDelete: () => void;
  onLongPress: () => void;
  isCurrent?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const longPress = useLongPress(onLongPress);

  return (
    <SwipeableRow
      className="rounded-lg"
      leading={leading}
      trailing={{
        icon: <Trash2 className="h-4 w-4" />,
        label: "Delete",
        className: "bg-destructive text-destructive-foreground",
        onTrigger: onDelete,
      }}
    >
      <button
        type="button"
        onClick={onTap}
        disabled={disabled}
        {...longPress}
        className={cn(
          "flex w-full select-none items-center gap-3 rounded-lg border border-border bg-card p-2 text-left",
          isCurrent && "ring-2 ring-primary",
        )}
        style={{ WebkitTouchCallout: "none" }}
      >
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
          {row.firstPhotoFileId ? (
            <CaptureThumb
              fileId={row.firstPhotoFileId}
              alt={row.code ?? "Captured item"}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Camera className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {row.code ?? "No product number"}
            {isCurrent && (
              <span className="ml-2 text-xs font-normal text-primary">
                current
              </span>
            )}
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Camera className="h-3 w-3" /> {row.photoCount}
            </span>
            {row.videoCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Video className="h-3 w-3" /> {row.videoCount}
              </span>
            )}
            {row.audioCount > 0 && (
              <span className="flex items-center gap-0.5">
                <FileAudio className="h-3 w-3" /> {row.audioCount}
              </span>
            )}
            <span>
              {new Date(row.createdAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            {row.statusLabel && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {row.statusLabel}
              </span>
            )}
          </p>
          {row.notes && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {row.notes}
            </p>
          )}
        </div>
        {busy && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        )}
      </button>
    </SwipeableRow>
  );
}
