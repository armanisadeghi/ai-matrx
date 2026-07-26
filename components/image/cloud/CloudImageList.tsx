"use client";

import { Check, Info, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { MediaThumbnail } from "@/features/files/components/core/MediaThumbnail/MediaThumbnail";
import type { CloudFileRecord } from "@/features/files/types";

export interface CloudImageListProps {
  files: CloudFileRecord[];
  resolvingId: string | null;
  selectionMode: "single" | "multiple" | "none";
  isSelected: (fileId: string) => boolean;
  bulkSelectedIds: string[];
  onToggleBulkSelected: (fileId: string) => void;
  onTileClick: (file: CloudFileRecord) => void;
  onShowMetadata: (file: CloudFileRecord) => void;
}

export function CloudImageList({
  files,
  resolvingId,
  selectionMode,
  isSelected,
  bulkSelectedIds,
  onToggleBulkSelected,
  onTileClick,
  onShowMetadata,
}: CloudImageListProps) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card overflow-hidden">
      {files.map((file) => {
        const selected = isSelected(file.id);
        const bulkSelected = bulkSelectedIds.includes(file.id);
        const resolving = resolvingId === file.id;
        const isBrowse = selectionMode === "none";
        const updatedAt = file.updatedAt ? new Date(file.updatedAt) : null;
        const sizeLabel = formatFileSize(file.fileSize);
        return (
          <li
            key={file.id}
            className={cn(
              "flex items-center gap-3 pl-2 pr-3 py-1.5 transition-colors",
              bulkSelected || (!isBrowse && selected)
                ? "bg-primary/10"
                : "hover:bg-accent/40",
            )}
          >
            <Checkbox
              checked={bulkSelected}
              onCheckedChange={() => onToggleBulkSelected(file.id)}
              aria-label={`Select ${file.fileName} for bulk actions`}
              className="shrink-0"
            />
            <button
              type="button"
              onClick={() => onTileClick(file)}
              disabled={resolving}
              className={cn(
                "flex flex-1 min-w-0 items-center gap-3 text-left focus:outline-none rounded-sm focus:ring-2 focus:ring-primary/40",
                resolving && "opacity-60 cursor-wait",
              )}
              aria-label={
                isBrowse
                  ? `Open ${file.fileName}`
                  : selected
                    ? `Deselect ${file.fileName}`
                    : `Select ${file.fileName}`
              }
            >
              <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-sm bg-muted/40">
                <MediaThumbnail
                  file={file}
                  iconSize={20}
                  className="absolute inset-0"
                />
                {resolving ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-foreground truncate">
                    {file.fileName}
                  </span>
                  {!isBrowse && selected ? (
                    <Check className="h-3 w-3 text-primary flex-shrink-0" />
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {[
                    sizeLabel,
                    updatedAt ? formatRelative(updatedAt) : null,
                    file.mimeType,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShowMetadata(file);
              }}
              aria-label={`Details for ${file.fileName}`}
              className="h-7 w-7 flex-shrink-0 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex items-center justify-center"
              title="File details"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function formatFileSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}
