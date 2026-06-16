/**
 * features/files/components/core/FileList/FileListRow.tsx
 *
 * Single row in the list view. Memoized — a long list re-renders a lot on
 * selection / sort changes, so every row must skip work when its inputs
 * haven't changed.
 */

"use client";

import { memo } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FolderContextMenu } from "@/features/files/components/core/FolderContextMenu/FolderContextMenu";
import {
  FileRowContextMenu,
  FolderRowContextMenu,
} from "@/features/files/components/core/RowContextMenu/RowContextMenu";
import { formatFileSize, formatRelativeTime } from "@/features/files/utils/format";
import { FileContextCell } from "../../surfaces/desktop/FileContextCell";
import type { CloudFileRecord, CloudFolderRecord } from "@/features/files/types";

export interface FileListRowProps {
  record: CloudFileRecord | CloudFolderRecord;
  kind: "file" | "folder";
  selected: boolean;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onRename?: () => void;
  onShare?: () => void;
  onMove?: () => void;
  /** Disable drag-and-drop (read-only contexts). */
  dragDisabled?: boolean;
  /** Show the per-file Context cell (value + picker). The list primes the
   *  shared row-scope store in bulk; the cell never fetches on its own. */
  showContext?: boolean;
}

function FileListRowImpl({
  record,
  kind,
  selected,
  onClick,
  onDoubleClick,
  onRename,
  onShare,
  onMove,
  dragDisabled,
  showContext,
}: FileListRowProps) {
  const isFolder = kind === "folder";
  const name = isFolder
    ? (record as CloudFolderRecord).folderName
    : (record as CloudFileRecord).fileName;
  const size = isFolder ? null : (record as CloudFileRecord).fileSize;
  const updated = record.updatedAt;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: `list-${record.id}`,
    data: { type: kind, id: record.id },
    disabled: dragDisabled,
  });

  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `list-drop-${record.id}`,
    data: { type: kind, id: record.id },
    disabled: !isFolder,
  });

  const setMergedRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    if (isFolder) setDropRef(node);
  };

  const rowBody = (
    <div
      ref={setMergedRef}
      role="row"
      aria-selected={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      {...attributes}
      {...listeners}
      className={cn(
        "group grid items-center gap-3 px-3 py-1.5",
        showContext
          ? "grid-cols-[auto_1fr_100px_120px_150px_auto]"
          : "grid-cols-[auto_1fr_100px_120px_auto]",
        "text-sm select-none cursor-pointer border-b border-border/50",
        "hover:bg-accent/60",
        selected && "bg-accent text-accent-foreground",
        isOver && isFolder && "bg-primary/10 ring-1 ring-inset ring-primary",
      )}
    >
      <FileIcon
        fileName={isFolder ? undefined : name}
        isFolder={isFolder}
        size={16}
      />

      <span className="truncate min-w-0">{name}</span>

      <span className="text-xs text-muted-foreground tabular-nums">
        {isFolder ? "—" : formatFileSize(size)}
      </span>

      <span className="text-xs text-muted-foreground">
        {formatRelativeTime(updated)}
      </span>

      {showContext && (
        <div className="min-w-0">
          {isFolder ? (
            <span className="text-xs text-muted-foreground/40">—</span>
          ) : (
            <FileContextCell fileId={record.id} fileName={name} />
          )}
        </div>
      )}

      <div
        className="opacity-0 group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {isFolder ? (
          <FolderContextMenu
            folderId={record.id}
            onRename={onRename}
            onMove={onMove}
          >
            <button
              type="button"
              aria-label="Folder actions"
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </FolderContextMenu>
        ) : (
          <FileContextMenu
            fileId={record.id}
            onRename={onRename}
            onShare={onShare}
            onMove={onMove}
          >
            <button
              type="button"
              aria-label="File actions"
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </FileContextMenu>
        )}
      </div>
    </div>
  );

  return isFolder ? (
    <FolderRowContextMenu folderId={record.id}>{rowBody}</FolderRowContextMenu>
  ) : (
    <FileRowContextMenu fileId={record.id}>{rowBody}</FileRowContextMenu>
  );
}

export const FileListRow = memo(FileListRowImpl);
