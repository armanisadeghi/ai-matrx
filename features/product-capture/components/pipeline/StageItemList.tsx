"use client";

/**
 * StageItemList — the items sitting at the active stage (newest first).
 * Compact selectable rows: featured/first thumbnail, code, status, time.
 */

import React from "react";
import { Camera, Loader2 } from "lucide-react";

import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { cn } from "@/lib/utils";

import type { PipelineItem } from "../../pipeline-service";

export interface StageListEntry {
  item: PipelineItem;
  /** Featured image (falls back to first photo) — resolved by the caller. */
  thumbFileId: string | null;
  photoCount: number;
  openQuestions: number;
}

export function StageItemList({
  entries,
  loading,
  selectedId,
  onSelect,
}: {
  entries: StageListEntry[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (item: PipelineItem) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <p className="px-3 py-10 text-center text-sm text-muted-foreground">
        No items at this stage.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {entries.map(({ item, thumbFileId, photoCount, openQuestions }) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors",
              item.id === selectedId
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:bg-muted/50",
            )}
          >
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
              {thumbFileId ? (
                <CaptureThumb
                  fileId={thumbFileId}
                  alt={item.code ?? "Item"}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {item.code ?? "No product number"}
              </p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {photoCount} photo{photoCount === 1 ? "" : "s"}
                </span>
                {openQuestions > 0 && (
                  <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                    {openQuestions} open
                  </span>
                )}
                <span>
                  {new Date(item.createdAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
