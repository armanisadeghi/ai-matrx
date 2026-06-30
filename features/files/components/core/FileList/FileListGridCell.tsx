/**
 * features/files/components/core/FileList/FileListGridCell.tsx
 *
 * Grid (thumbnail) view cell — Dropbox/Drive-style tile.
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
import { formatFileSize, truncateFilename } from "@/features/files/utils/format";
import type { CloudFileRecord, CloudFolderRecord } from "@/features/files/types";

export interface FileListGridCellProps {
  record: CloudFileRecord | CloudFolderRecord;
  kind: "file" | "folder";
  selected: boolean;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onRename?: () => void;
  onShare?: () => void;
  onMove?: () => void;
  dragDisabled?: boolean;
}

function FileListGridCellImpl({
  record,
  kind,
  selected,
  onClick,
  onDoubleClick,
  onRename,
  onShare,
  onMove,
  dragDisabled,
}: FileListGridCellProps) {
  const isFolder = kind === "folder";
  const name = isFolder
    ? (record as CloudFolderRecord).folderName
    : (record as CloudFileRecord).fileName;
  const size = isFolder ? null : (record as CloudFileRecord).fileSize;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: `grid-${record.id}`,
    data: { type: kind, id: record.id },
    disabled: dragDisabled,
  });

  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `grid-drop-${record.id}`,
    data: { type: kind, id: record.id },
    disabled: !isFolder,
  });

  const setMergedRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    if (isFolder) setDropRef(node);
  };

  const cellBody = (
    <div
      ref={setMergedRef}
      aria-selected={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      {...attributes}
      {...listeners}
      role="gridcell"
      className={cn(
        "group relative flex flex-col items-center justify-start gap-2 p-3 rounded-md",
        "cursor-pointer select-none border border-transparent",
        "hover:bg-accent/60 hover:border-border",
        selected && "bg-accent border-border text-accent-foreground",
        isOver && isFolder && "bg-primary/10 border-primary",
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded bg-muted/40">
        <FileIcon
          fileName={isFolder ? undefined : name}
          isFolder={isFolder}
          size={32}
        />
      </div>

      <div className="w-full text-center">
        <div className="text-xs font-medium truncate" title={name}>
          {truncateFilename(name, 18)}
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {isFolder ? "Folder" : formatFileSize(size)}
        </div>
      </div>

      <div
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
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
              className="flex h-6 w-6 items-center justify-center rounded bg-background/80 hover:bg-background"
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
              className="flex h-6 w-6 items-center justify-center rounded bg-background/80 hover:bg-background"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </FileContextMenu>
        )}
      </div>
    </div>
  );

  return isFolder ? (
    <FolderRowContextMenu folderId={record.id}>{cellBody}</FolderRowContextMenu>
  ) : (
    <FileRowContextMenu fileId={record.id}>{cellBody}</FileRowContextMenu>
  );
}

export const FileListGridCell = memo(FileListGridCellImpl);
