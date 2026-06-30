/**
 * features/files/components/core/FileTree/FileTreeRow.tsx
 *
 * One row in the virtualized tree. Designed to mimic VS Code's explorer:
 * tight height, chevron + icon + name, right-side action affordance on hover.
 */

"use client";

import { forwardRef, memo } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { FileRagBadge } from "@/features/files/components/core/FileBadges/FileRagBadge";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FolderContextMenu } from "@/features/files/components/core/FolderContextMenu/FolderContextMenu";
import {
  FileRowContextMenu,
  FolderRowContextMenu,
} from "@/features/files/components/core/RowContextMenu/RowContextMenu";
import type { TreeRow } from "./useTreeExpansion";

const INDENT_PX = 14;
const ROW_HEIGHT_PX = 24;

export const FILE_TREE_ROW_HEIGHT = ROW_HEIGHT_PX;

export interface FileTreeRowProps {
  row: TreeRow;
  selected: boolean;
  focused: boolean;
  onClick: (event: React.MouseEvent) => void;
  onChevronClick: () => void;
  onDoubleClick?: () => void;
  onRename?: () => void;
  onShare?: () => void;
  onMove?: () => void;
  /** When dragging is active, disables hover effects to keep the UI quiet. */
  isDragging?: boolean;
  /** Drag disabled (e.g. read-only permission). */
  dragDisabled?: boolean;
}

function FileTreeRowImpl(
  {
    row,
    selected,
    focused,
    onClick,
    onChevronClick,
    onDoubleClick,
    onRename,
    onShare,
    onMove,
    isDragging,
    dragDisabled,
  }: FileTreeRowProps,
  ref: React.Ref<HTMLDivElement>,
) {
  const isFolder = row.kind === "folder";
  const name =
    row.kind === "folder"
      ? (row.record as { folderName: string }).folderName
      : (row.record as { fileName: string }).fileName;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: `tree-${row.id}`,
    data: { type: row.kind, id: row.id },
    disabled: dragDisabled,
  });

  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `tree-drop-${row.id}`,
    data: { type: row.kind, id: row.id },
    disabled: !isFolder,
  });

  const setMergedRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    if (isFolder) setDropRef(node);
    if (typeof ref === "function") ref(node);
    else if (ref)
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  const rowBody = (
    <div
      ref={setMergedRef}
      {...attributes}
      {...listeners}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={isFolder ? row.expanded : undefined}
      aria-level={row.depth + 1}
      tabIndex={focused ? 0 : -1}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "group flex items-center text-xs select-none cursor-pointer",
        "hover:bg-accent/60",
        selected && "bg-accent text-accent-foreground",
        focused && !selected && "ring-1 ring-inset ring-ring/40",
        isOver && isFolder && "ring-1 ring-inset ring-primary bg-primary/10",
        isDragging && "opacity-50",
      )}
      style={{
        height: `${ROW_HEIGHT_PX}px`,
        paddingLeft: `${row.depth * INDENT_PX + 4}px`,
      }}
    >
      <div className="flex h-full w-[14px] items-center justify-center">
        {isFolder ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={row.expanded ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              if (!row.empty) onChevronClick();
            }}
            className={cn(
              "flex h-full w-full items-center justify-center rounded",
              !row.empty && "hover:bg-accent",
              row.empty && "opacity-30 cursor-default",
            )}
          >
            {row.expanded ? (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      <FileIcon
        fileName={isFolder ? undefined : name}
        isFolder={isFolder}
        open={isFolder && row.expanded}
        size={14}
        className="mx-1"
      />

      <span className="truncate pr-2 flex-1 min-w-0 inline-flex items-center gap-1">
        <span className="truncate">{name}</span>
        {!isFolder ? (
          <FileRagBadge fileId={row.id} className="shrink-0" />
        ) : null}
      </span>

      <div
        className={cn(
          "opacity-0 group-hover:opacity-100 pr-1",
          focused && "opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {isFolder ? (
          <FolderContextMenu
            folderId={row.id}
            onRename={onRename}
            onMove={onMove}
          >
            <button
              type="button"
              tabIndex={-1}
              aria-label="Folder actions"
              className="flex h-4 w-4 items-center justify-center rounded hover:bg-accent"
            >
              <MoreHorizontal className="h-3 w-3" aria-hidden="true" />
            </button>
          </FolderContextMenu>
        ) : (
          <FileContextMenu
            fileId={row.id}
            onRename={onRename}
            onShare={onShare}
            onMove={onMove}
          >
            <button
              type="button"
              tabIndex={-1}
              aria-label="File actions"
              className="flex h-4 w-4 items-center justify-center rounded hover:bg-accent"
            >
              <MoreHorizontal className="h-3 w-3" aria-hidden="true" />
            </button>
          </FileContextMenu>
        )}
      </div>
    </div>
  );

  return isFolder ? (
    <FolderRowContextMenu folderId={row.id}>{rowBody}</FolderRowContextMenu>
  ) : (
    <FileRowContextMenu fileId={row.id}>{rowBody}</FileRowContextMenu>
  );
}

export const FileTreeRow = memo(forwardRef(FileTreeRowImpl));
