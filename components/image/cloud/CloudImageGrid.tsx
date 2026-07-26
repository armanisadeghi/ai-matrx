"use client";

import React from "react";
import { Check, Info, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { MediaThumbnail } from "@/features/files/components/core/MediaThumbnail/MediaThumbnail";
import type { CloudFileRecord } from "@/features/files/types";

export type CloudImageViewMode = "cozy" | "compact";

export interface CloudImageGridProps {
  files: CloudFileRecord[];
  density: CloudImageViewMode;
  resolvingId: string | null;
  selectionMode: "single" | "multiple" | "none";
  isSelected: (fileId: string) => boolean;
  bulkSelectedIds: string[];
  onToggleBulkSelected: (fileId: string) => void;
  onTileClick: (file: CloudFileRecord) => void;
  onShowMetadata: (file: CloudFileRecord) => void;
}

export function CloudImageGrid({
  files,
  density,
  resolvingId,
  selectionMode,
  isSelected,
  bulkSelectedIds,
  onToggleBulkSelected,
  onTileClick,
  onShowMetadata,
}: CloudImageGridProps) {
  const gridClasses =
    density === "compact"
      ? "grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-2"
      : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3";
  const iconSize = density === "compact" ? 32 : 48;
  const checkSize =
    density === "compact"
      ? "h-4 w-4 top-1 right-1"
      : "h-5 w-5 top-1.5 right-1.5";
  const infoSize =
    density === "compact"
      ? "h-4 w-4 top-1 right-1"
      : "h-5 w-5 top-1.5 right-1.5";

  return (
    <div className={gridClasses}>
      {files.map((file) => {
        const selected = isSelected(file.id);
        const bulkSelected = bulkSelectedIds.includes(file.id);
        const resolving = resolvingId === file.id;
        const isBrowse = selectionMode === "none";
        return (
          <div
            key={file.id}
            className={cn(
              "group relative aspect-square overflow-hidden rounded-md border-2 bg-muted/40 transition-all",
              "hover:border-primary/50 focus-within:ring-2 focus-within:ring-primary/40",
              bulkSelected || (!isBrowse && selected)
                ? "border-primary ring-2 ring-primary/30"
                : "border-transparent",
              resolving && "opacity-60",
            )}
            title={file.fileName}
          >
            <button
              type="button"
              onClick={() => onTileClick(file)}
              disabled={resolving}
              className="absolute inset-0 focus:outline-none"
              aria-label={
                isBrowse
                  ? `Open ${file.fileName}`
                  : selected
                    ? `Deselect ${file.fileName}`
                    : `Select ${file.fileName}`
              }
            >
              <MediaThumbnail
                file={file}
                iconSize={iconSize}
                className="absolute inset-0"
              />
            </button>

            <div
              className="absolute left-1.5 top-1.5 z-10"
              onClick={(event) => event.stopPropagation()}
            >
              <Checkbox
                checked={bulkSelected}
                onCheckedChange={() => onToggleBulkSelected(file.id)}
                aria-label={`Select ${file.fileName} for bulk actions`}
                className="bg-background/90 backdrop-blur"
              />
            </div>

            {!isBrowse && selected ? (
              <div
                className={cn(
                  "absolute rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md",
                  checkSize,
                )}
              >
                <Check className="h-3 w-3" />
              </div>
            ) : null}

            {resolving ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : null}

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShowMetadata(file);
              }}
              title="File details"
              aria-label={`Details for ${file.fileName}`}
              className={cn(
                "absolute z-10 rounded-full bg-background/80 text-foreground flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-background",
                infoSize,
              )}
            >
              <Info className="h-3 w-3" />
            </button>

            {density !== "compact" ? (
              <div className="pointer-events-none absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent text-white text-[11px] px-2 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                {file.fileName}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
