/**
 * features/files/components/core/FileMeta/FileMeta.tsx
 *
 * Compact metadata row — size, updated time, visibility, owner. Used by the
 * FileList row and FilePreview header. Fields are rendered as dot-separated
 * spans so they wrap nicely at narrow widths.
 */

"use client";

import { Globe, Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatFileSize,
  formatRelativeTime,
  formatAbsoluteDate,
} from "@/features/files/utils/format";
import type { CloudFile, Visibility } from "@/features/files/types";

export interface FileMetaProps {
  file: Pick<CloudFile, "fileSize" | "updatedAt" | "visibility">;
  /** When true, shows absolute dates instead of relative. */
  absoluteDates?: boolean;
  /** Hide specific fields. */
  hide?: {
    size?: boolean;
    updated?: boolean;
    visibility?: boolean;
  };
  className?: string;
}

const VISIBILITY_ICONS: Record<Visibility, typeof Lock> = {
  personal: Lock,
  public: Globe,
  shared: Users,
};

const VISIBILITY_LABELS: Record<Visibility, string> = {
  personal: "Personal",
  public: "Public",
  shared: "Shared",
};

export function FileMeta({
  file,
  absoluteDates,
  hide,
  className,
}: FileMetaProps) {
  const VisibilityIcon = VISIBILITY_ICONS[file.visibility];
  const fields: React.ReactNode[] = [];

  if (!hide?.size) {
    fields.push(
      <span key="size" className="tabular-nums">
        {formatFileSize(file.fileSize)}
      </span>,
    );
  }

  if (!hide?.updated) {
    fields.push(
      <span key="updated" title={formatAbsoluteDate(file.updatedAt)}>
        {absoluteDates
          ? formatAbsoluteDate(file.updatedAt)
          : formatRelativeTime(file.updatedAt)}
      </span>,
    );
  }

  if (!hide?.visibility) {
    fields.push(
      <span key="visibility" className="inline-flex items-center gap-1">
        <VisibilityIcon className="h-3 w-3" aria-hidden="true" />
        {VISIBILITY_LABELS[file.visibility]}
      </span>,
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {fields.map((field, idx) => (
        <span key={idx} className="inline-flex items-center">
          {field}
          {idx < fields.length - 1 ? (
            <span aria-hidden="true" className="ml-2 opacity-50">
              ·
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
