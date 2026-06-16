/**
 * features/files/components/core/FileList/FileList.tsx
 *
 * Main area list — Dropbox/Drive style. Shows files + folders in the CURRENT
 * folder (or root). Supports list and grid views, sort headers, drag-and-drop
 * moves.
 */

"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectSort, selectViewMode } from "@/features/files/redux/selectors";
import { moveFile } from "@/features/files/redux/thunks";
import { setSort } from "@/features/files/redux/slice";
import { useFolderContents } from "@/features/files/hooks/useFolderContents";
import { useFileSelection } from "@/features/files/hooks/useFileSelection";
import { primeEntityScopes } from "@/features/scopes/components/context-assignment/data";
import { FileListRow } from "./FileListRow";
import { FileListGridCell } from "./FileListGridCell";
import type { SortBy } from "@/features/files/types";

export interface FileListProps {
  /** The folder whose contents to list. null = root. */
  folderId: string | null;
  onActivateFile?: (fileId: string) => void;
  onActivateFolder?: (folderId: string) => void;
  onRenameRequest?: (fileId: string) => void;
  onShareRequest?: (fileId: string) => void;
  onMoveRequest?: (fileId: string) => void;
  readOnly?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
  /** Show a per-file Context column (value + picker), matching the main
   *  /files route. Off by default so pickers/embeds stay lean. */
  showContext?: boolean;
}

const SORT_LABELS: Record<SortBy, string> = {
  name: "Name",
  updated_at: "Modified",
  created_at: "Created",
  size: "Size",
  type: "Type",
  extension: "Extension",
  mime: "MIME",
  path: "Path",
  owner: "Owner",
  version: "Version",
};

export function FileList({
  folderId,
  onActivateFile,
  onActivateFolder,
  onRenameRequest,
  onShareRequest,
  onMoveRequest,
  readOnly,
  emptyState,
  className,
  showContext,
}: FileListProps) {
  const dispatch = useAppDispatch();
  const { files, folders, loading } = useFolderContents(folderId);
  const selection = useFileSelection();
  const sort = useAppSelector(selectSort);
  const viewMode = useAppSelector(selectViewMode);

  // Prime the shared row-scope store ONCE per visible page so each Context
  // cell reads from cache instead of fetching (N rows ≠ N requests).
  const fileIdsKey = files.map((f) => f.id).join(",");
  useEffect(() => {
    if (!showContext) return;
    const ids = fileIdsKey ? fileIdsKey.split(",") : [];
    if (ids.length) primeEntityScopes("file", ids);
  }, [showContext, fileIdsKey]);

  // Ordered list for shift-click ranges.
  const orderedIds = useMemo(
    () => [...folders.map((f) => f.id), ...files.map((f) => f.id)],
    [folders, files],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleHeaderClick = useCallback(
    (column: SortBy) => {
      const nextDir =
        sort.sortBy === column && sort.sortDir === "asc" ? "desc" : "asc";
      dispatch(setSort({ sortBy: column, sortDir: nextDir }));
    },
    [dispatch, sort],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const active = event.active.data.current as
        | { type?: string; id?: string }
        | undefined;
      const over = event.over?.data.current as
        | { type?: string; id?: string }
        | undefined;
      if (!active?.id || !over?.id) return;
      if (over.type !== "folder") return;
      if (active.type !== "file") return;
      if (active.id === over.id) return;
      void dispatch(
        moveFile({ fileId: active.id, newParentFolderId: over.id }),
      );
    },
    [dispatch],
  );

  // Empty state.
  if (!loading && folders.length === 0 && files.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center text-sm text-muted-foreground p-6",
          className,
        )}
      >
        {emptyState ?? "This folder is empty."}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div
        className={cn("flex h-full w-full flex-col overflow-hidden", className)}
      >
        {viewMode === "list" ? (
          <>
            <div
              className={cn(
                "grid items-center gap-3 px-3 py-1.5 border-b bg-muted/40 text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
                showContext
                  ? "grid-cols-[auto_1fr_100px_120px_150px_auto]"
                  : "grid-cols-[auto_1fr_100px_120px_auto]",
              )}
              role="row"
            >
              <span className="w-4" />
              <SortHeaderButton
                label={SORT_LABELS.name}
                column="name"
                activeColumn={sort.sortBy}
                direction={sort.sortDir}
                onClick={handleHeaderClick}
              />
              <SortHeaderButton
                label={SORT_LABELS.size}
                column="size"
                activeColumn={sort.sortBy}
                direction={sort.sortDir}
                onClick={handleHeaderClick}
                align="right"
              />
              <SortHeaderButton
                label={SORT_LABELS.updated_at}
                column="updated_at"
                activeColumn={sort.sortBy}
                direction={sort.sortDir}
                onClick={handleHeaderClick}
              />
              {showContext && <span>Context</span>}
              <span className="w-6" />
            </div>
            <div className="flex-1 overflow-auto" role="rowgroup">
              {folders.map((folder) => (
                <FileListRow
                  key={folder.id}
                  record={folder}
                  kind="folder"
                  selected={selection.isSelected(folder.id)}
                  onClick={(e) =>
                    selection.handleClick(folder.id, e, orderedIds)
                  }
                  onDoubleClick={() => onActivateFolder?.(folder.id)}
                  dragDisabled={readOnly}
                  showContext={showContext}
                />
              ))}
              {files.map((file) => (
                <FileListRow
                  key={file.id}
                  record={file}
                  kind="file"
                  selected={selection.isSelected(file.id)}
                  onClick={(e) => selection.handleClick(file.id, e, orderedIds)}
                  onDoubleClick={() => onActivateFile?.(file.id)}
                  onRename={
                    onRenameRequest ? () => onRenameRequest(file.id) : undefined
                  }
                  onShare={
                    onShareRequest ? () => onShareRequest(file.id) : undefined
                  }
                  onMove={
                    onMoveRequest ? () => onMoveRequest(file.id) : undefined
                  }
                  dragDisabled={readOnly}
                  showContext={showContext}
                />
              ))}
            </div>
          </>
        ) : (
          <div
            className="flex-1 overflow-auto p-3 grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
              contentVisibility: "auto",
            }}
            role="grid"
          >
            {folders.map((folder) => (
              <FileListGridCell
                key={folder.id}
                record={folder}
                kind="folder"
                selected={selection.isSelected(folder.id)}
                onClick={(e) => selection.handleClick(folder.id, e, orderedIds)}
                onDoubleClick={() => onActivateFolder?.(folder.id)}
                dragDisabled={readOnly}
              />
            ))}
            {files.map((file) => (
              <FileListGridCell
                key={file.id}
                record={file}
                kind="file"
                selected={selection.isSelected(file.id)}
                onClick={(e) => selection.handleClick(file.id, e, orderedIds)}
                onDoubleClick={() => onActivateFile?.(file.id)}
                onRename={
                  onRenameRequest ? () => onRenameRequest(file.id) : undefined
                }
                onShare={
                  onShareRequest ? () => onShareRequest(file.id) : undefined
                }
                onMove={
                  onMoveRequest ? () => onMoveRequest(file.id) : undefined
                }
                dragDisabled={readOnly}
              />
            ))}
          </div>
        )}
      </div>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Sort header (extracted outside FileList to avoid rerender-no-inline rule).
// ---------------------------------------------------------------------------

interface SortHeaderButtonProps {
  label: string;
  column: SortBy;
  activeColumn: SortBy;
  direction: "asc" | "desc";
  onClick: (column: SortBy) => void;
  align?: "left" | "right";
}

function SortHeaderButton({
  label,
  column,
  activeColumn,
  direction,
  onClick,
  align = "left",
}: SortHeaderButtonProps) {
  const active = activeColumn === column;
  return (
    <button
      type="button"
      onClick={() => onClick(column)}
      className={cn(
        "inline-flex items-center gap-1 truncate rounded px-1 py-0.5 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        align === "right" && "justify-end",
        active && "text-foreground",
      )}
    >
      {label}
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3 w-3" aria-hidden="true" />
        )
      ) : null}
    </button>
  );
}
