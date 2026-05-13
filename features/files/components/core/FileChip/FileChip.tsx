/**
 * features/files/components/core/FileChip/FileChip.tsx
 *
 * A compact reference to a cloud file — icon, name, optional size, optional
 * remove button. Useful everywhere other features need to display attached
 * files (message composer, task attachments, scraped sources, etc.).
 *
 * Reads live state from the `cloudFiles` slice, so rename/delete events from
 * the realtime middleware flow into every chip automatically — no caller
 * work required.
 *
 * If the file isn't in state yet (e.g. just-shared file not in your tree),
 * renders a graceful placeholder with the file id.
 */

"use client";

import { useCallback } from "react";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { truncateFilename, formatFileSize } from "@/features/files/utils/format";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { FileDuplicateOfBadge } from "@/features/files/components/core/FileBadges/FileDuplicateOfBadge";

export interface FileChipProps {
  fileId: string;
  /** Called when the × is clicked. If omitted, no remove button renders. */
  onRemove?: (fileId: string) => void;
  /** Click handler for the chip body (e.g. open preview). Otherwise a no-op. */
  onClick?: (fileId: string) => void;
  /** Show file size next to the name. Default false. */
  showSize?: boolean;
  /** Provide your own "open" action button. Default: none. */
  showOpenButton?: boolean;
  /** Max chars for name truncation. Default 22. */
  maxNameLength?: number;
  /** Visual density. Default "md". */
  density?: "sm" | "md";
  className?: string;
}

export function FileChip({
  fileId,
  onRemove,
  onClick,
  showSize,
  showOpenButton,
  maxNameLength = 22,
  density = "md",
  className,
}: FileChipProps) {
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const actions = useFileActions(fileId);

  const handleClick = useCallback(() => {
    if (onClick) onClick(fileId);
  }, [onClick, fileId]);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove?.(fileId);
    },
    [onRemove, fileId],
  );

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void actions.download();
    },
    [actions],
  );

  const name = file?.fileName ?? `file:${fileId.slice(0, 8)}`;
  const size = file?.fileSize ?? null;
  const isKnown = !!file;

  const heightClass = density === "sm" ? "h-6" : "h-7";
  const textClass = density === "sm" ? "text-[11px]" : "text-xs";

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick ? handleClick : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border bg-card px-2",
        heightClass,
        textClass,
        onClick && "hover:bg-accent/60 cursor-pointer",
        !isKnown && "opacity-70",
        className,
      )}
      title={name}
    >
      <FileIcon
        fileName={file?.fileName ?? "file"}
        size={density === "sm" ? 12 : 14}
      />
      <span className="truncate font-medium">
        {truncateFilename(name, maxNameLength)}
      </span>
      {showSize && size != null ? (
        <span className="text-muted-foreground tabular-nums">
          {formatFileSize(size)}
        </span>
      ) : null}
      {file?.duplicateOfFileId ? (
        <FileDuplicateOfBadge
          keeperFileId={file.duplicateOfFileId}
          density={density}
        />
      ) : null}
      {showOpenButton ? (
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Open"
          className="flex h-4 w-4 items-center justify-center rounded hover:bg-accent"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={handleRemove}
          aria-label="Remove"
          className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FileChipList — convenience for "render these N attached files".
// ---------------------------------------------------------------------------

export interface FileChipListProps {
  fileIds: string[];
  onRemove?: (fileId: string) => void;
  onClick?: (fileId: string) => void;
  showSize?: boolean;
  showOpenButton?: boolean;
  density?: "sm" | "md";
  className?: string;
  emptyState?: React.ReactNode;
}

export function FileChipList({
  fileIds,
  onRemove,
  onClick,
  showSize,
  showOpenButton,
  density,
  className,
  emptyState,
}: FileChipListProps) {
  if (fileIds.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {fileIds.map((id) => (
        <FileChip
          key={id}
          fileId={id}
          onRemove={onRemove}
          onClick={onClick}
          showSize={showSize}
          showOpenButton={showOpenButton}
          density={density}
        />
      ))}
    </div>
  );
}
