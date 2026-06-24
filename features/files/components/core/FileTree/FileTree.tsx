/**
 * features/files/components/core/FileTree/FileTree.tsx
 *
 * VS Code-style file tree. Virtualized (handles 10k+ rows), keyboard
 * navigable (↑/↓/←/→/Enter), supports drag-and-drop moves via dnd-kit.
 *
 * Used by the PageShell sidebar, the WindowPanelShell sidebar, and inside
 * FilePicker. Mobile surfaces use a different rendering (push-nav) — do not
 * import FileTree on mobile.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDndMonitor } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronsDown, ChevronsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileSelection } from "@/features/files/hooks/useFileSelection";
import { FILE_TREE_ROW_HEIGHT, FileTreeRow } from "./FileTreeRow";
import { useTreeExpansion } from "./useTreeExpansion";
import type { TreeRow } from "./useTreeExpansion";
import { TooltipIcon } from "@/features/files/components/core/Tooltip/TooltipIcon";

export interface FileTreeProps {
  /** Called when a row (file or folder) is activated (Enter / double-click). */
  onActivateFile?: (fileId: string) => void;
  onActivateFolder?: (folderId: string) => void;
  /** Click handlers — called after selection updates. */
  onSelectFile?: (fileId: string) => void;
  onSelectFolder?: (folderId: string) => void;
  onRenameRequest?: (fileId: string) => void;
  onShareRequest?: (fileId: string) => void;
  onMoveRequest?: (fileId: string) => void;
  className?: string;
  /** Initial expanded folder IDs. */
  initialExpanded?: string[];
  /** Disable drag-and-drop moves (read-only contexts). */
  readOnly?: boolean;
  /** Optional empty-state content. */
  emptyState?: React.ReactNode;
}

export function FileTree({
  onActivateFile,
  onActivateFolder,
  onSelectFile,
  onSelectFolder,
  onRenameRequest,
  onShareRequest,
  onMoveRequest,
  className,
  initialExpanded,
  readOnly,
  emptyState,
}: FileTreeProps) {
  const selection = useFileSelection();
  const expansion = useTreeExpansion({ initialExpanded });
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const rows = expansion.rows;
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => FILE_TREE_ROW_HEIGHT,
    overscan: 12,
  });

  // FileTree no longer owns its own DndContext — drag/drop registers with
  // the parent context (PageShell). useDndMonitor lets us still observe
  // start/end events for local UI feedback (the dragged-row dim) without
  // duplicating registration.
  useDndMonitor({
    onDragStart(event) {
      const id = (event.active.data.current as { id?: string } | undefined)?.id;
      if (id) setDraggingId(id);
    },
    onDragEnd() {
      setDraggingId(null);
    },
    onDragCancel() {
      setDraggingId(null);
    },
  });

  // ------------------------------------------------------------------- events

  const handleRowClick = useCallback(
    (row: TreeRow, index: number, event: React.MouseEvent) => {
      selection.handleClick(row.id, event, rowIds);
      setFocusedIndex(index);
      if (row.kind === "file") {
        onSelectFile?.(row.id);
      } else {
        onSelectFolder?.(row.id);
      }
    },
    [selection, rowIds, onSelectFile, onSelectFolder],
  );

  const handleRowDoubleClick = useCallback(
    (row: TreeRow) => {
      if (row.kind === "folder") {
        expansion.toggle(row.id);
        onActivateFolder?.(row.id);
      } else {
        onActivateFile?.(row.id);
      }
    },
    [expansion, onActivateFile, onActivateFolder],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (rows.length === 0) return;
      const row = rows[focusedIndex] ?? rows[0];
      const idx = rows.indexOf(row);

      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          const next = Math.min(rows.length - 1, idx + 1);
          setFocusedIndex(next);
          virtualizer.scrollToIndex(next, { align: "auto" });
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          const prev = Math.max(0, idx - 1);
          setFocusedIndex(prev);
          virtualizer.scrollToIndex(prev, { align: "auto" });
          break;
        }
        case "ArrowRight": {
          event.preventDefault();
          if (row.kind === "folder" && !row.expanded && !row.empty) {
            expansion.expand(row.id);
          } else if (row.kind === "folder" && row.expanded) {
            // Step into first child.
            const next = Math.min(rows.length - 1, idx + 1);
            setFocusedIndex(next);
          }
          break;
        }
        case "ArrowLeft": {
          event.preventDefault();
          if (row.kind === "folder" && row.expanded) {
            expansion.collapse(row.id);
          } else if (row.parentId) {
            const parentIdx = rows.findIndex(
              (r) => r.id === row.parentId && r.kind === "folder",
            );
            if (parentIdx >= 0) setFocusedIndex(parentIdx);
          }
          break;
        }
        case "Enter": {
          event.preventDefault();
          if (row.kind === "folder") {
            expansion.toggle(row.id);
            onActivateFolder?.(row.id);
          } else {
            onActivateFile?.(row.id);
          }
          break;
        }
        default:
          break;
      }
    },
    [
      rows,
      focusedIndex,
      expansion,
      virtualizer,
      onActivateFile,
      onActivateFolder,
    ],
  );

  // Keep focus in bounds if rows shrink.
  useEffect(() => {
    if (focusedIndex >= rows.length) {
      setFocusedIndex(rows.length ? rows.length - 1 : -1);
    }
  }, [rows.length, focusedIndex]);

  const virtualItems = virtualizer.getVirtualItems();

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "h-full w-full flex items-center justify-center text-xs text-muted-foreground p-4",
          className,
        )}
      >
        {emptyState ?? "No files yet."}
      </div>
    );
  }

  return (
    <>
      <div className={cn("flex h-full w-full flex-col", className)}>
        <div className="flex items-center justify-between gap-1 border-b border-border/60 bg-background/40 px-2 py-1 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Folders
          </span>
          <div className="flex items-center gap-1">
            <TooltipIcon label="Expand all folders">
              <button
                type="button"
                onClick={expansion.expandAll}
                aria-label="Expand all folders"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 text-[11px] font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
              >
                <ChevronsDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipIcon>
            <TooltipIcon label="Collapse all folders">
              <button
                type="button"
                onClick={expansion.collapseAll}
                aria-label="Collapse all folders"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 text-[11px] font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
              >
                <ChevronsUp className="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipIcon>
          </div>
        </div>
        <div
          ref={containerRef}
          role="tree"
          tabIndex={0}
          aria-multiselectable="true"
          onKeyDown={handleKeyDown}
          className={cn(
            "min-h-0 flex-1 overflow-auto outline-none",
            readOnly && "opacity-90 cursor-default",
          )}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {virtualItems.map((vItem) => {
              const row = rows[vItem.index];
              if (!row) return null;
              return (
                <div
                  key={row.id}
                  data-index={vItem.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  <FileTreeRow
                    row={row}
                    selected={selection.isSelected(row.id)}
                    focused={focusedIndex === vItem.index}
                    dragDisabled={readOnly}
                    isDragging={draggingId === row.id}
                    onClick={(e) => handleRowClick(row, vItem.index, e)}
                    onChevronClick={() => expansion.toggle(row.id)}
                    onDoubleClick={() => handleRowDoubleClick(row)}
                    onRename={
                      onRenameRequest
                        ? () => onRenameRequest(row.id)
                        : undefined
                    }
                    onShare={
                      onShareRequest ? () => onShareRequest(row.id) : undefined
                    }
                    onMove={
                      onMoveRequest ? () => onMoveRequest(row.id) : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
