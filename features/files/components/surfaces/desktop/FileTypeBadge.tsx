/**
 * features/files/components/surfaces/desktop/FileTypeBadge.tsx
 *
 * Compact "Type" cell rendered inside the file table. Reads from the
 * canonical `getFileTypeDetails` registry — same source as `FileIcon` and
 * the previewer pickers, so labels are guaranteed to stay in sync.
 *
 * Renders as `<extension chip> <category label>` for files (e.g. "PDF
 * Document", "TypeScript", "PNG image"); folders render a single
 * "Folder" pill. Color comes from the registry, so categories share
 * a recognizable palette across the icon, badge, and grid view.
 */

"use client";

import { cn } from "@/lib/utils";
import { getFilePreviewProfile } from "@/features/files/utils/file-types";

export interface FileTypeBadgeProps {
  fileName: string;
  mimeType?: string | null;
  /** Render the folder variant. */
  isFolder?: boolean;
  className?: string;
  /** Whether to render the small ALL-CAPS extension chip on the left. */
  showExtensionChip?: boolean;
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i <= 0 || i === filename.length - 1) return "";
  return filename.slice(i + 1).toUpperCase();
}

export function FileTypeBadge({
  fileName,
  mimeType = null,
  isFolder = false,
  className,
  showExtensionChip = true,
}: FileTypeBadgeProps) {
  if (isFolder) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <span className="rounded-sm border border-sky-500/40 bg-sky-500/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-sky-600 dark:text-sky-400">
          DIR
        </span>
        <span className="truncate">Folder</span>
      </span>
    );
  }

  const details = getFilePreviewProfile(fileName, mimeType, null).details;
  const ext = extOf(fileName);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {showExtensionChip && ext ? (
        <span
          className={cn(
            "rounded-sm border bg-background/60 px-1.5 py-px text-[10px] font-semibold tracking-wide",
            details.color,
            // Soft-tinted border that derives from the registry color so
            // the chip pulls together visually with the file's icon.
            "border-current/30",
          )}
        >
          {ext}
        </span>
      ) : null}
      <span className="truncate">{details.displayName}</span>
    </span>
  );
}
