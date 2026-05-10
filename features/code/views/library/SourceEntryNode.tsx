"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Pencil, Copy as CopyIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";
import { FileIcon } from "../../styles/file-icon";
import {
  ACTIVE_ROW,
  HOVER_ROW,
  ROW_HEIGHT,
  TEXT_BODY,
} from "../../styles/tokens";
import type {
  LibrarySourceAdapter,
  SourceEntry,
  SourceEntryField,
} from "../../library-sources/types";

interface SourceEntryNodeProps {
  adapter: LibrarySourceAdapter;
  entry: SourceEntry;
  depth: number;
  activeTabId: string | null;
  onOpen: (args: { sourceId: string; rowId: string; fieldId?: string }) => void;
  /**
   * Rename callback supplied by `SourceFolderNode`. Resolves with the
   * canonical name the adapter persisted (after sanitisation). When
   * `null`, the adapter doesn't expose a rename method and the menu
   * item is hidden.
   */
  onRename:
    | ((rowId: string, newName: string, expectedUpdatedAt?: string) => Promise<void>)
    | null;
  /** Refresh the parent source folder (re-list rows). */
  onRefresh: () => void | Promise<void>;
}

/**
 * One entry under a source folder. For single-field sources this
 * renders as a leaf (click → open). For multi-field sources (like
 * `tool_ui_components`) this renders as a collapsible folder whose
 * children are the editable code columns.
 */
export const SourceEntryNode: React.FC<SourceEntryNodeProps> = ({
  adapter,
  entry,
  depth,
  activeTabId,
  onOpen,
  onRename,
  onRefresh,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(entry.name);
  const [renaming_busy, setRenamingBusy] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Keep the input synced with the latest entry name when not editing.
  useEffect(() => {
    if (!renaming) setRenameValue(entry.name);
  }, [entry.name, renaming]);

  // Auto-focus + select the basename portion (so the user can retype the
  // name without retyping the extension).
  useEffect(() => {
    if (!renaming || !renameInputRef.current) return;
    const el = renameInputRef.current;
    el.focus();
    const dot = renameValue.lastIndexOf(".");
    if (dot > 0) el.setSelectionRange(0, dot);
    else el.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming]);

  const fields = entry.fields ?? null;

  const ownTabId = useMemo(() => {
    if (adapter.multiField) return null;
    try {
      return adapter.makeTabId(entry.rowId);
    } catch {
      return null;
    }
  }, [adapter, entry.rowId]);

  const selfActive = ownTabId !== null && ownTabId === activeTabId;

  const handleClick = useCallback(() => {
    if (renaming) return;
    if (adapter.multiField) {
      setExpanded((e) => !e);
      return;
    }
    onOpen({ sourceId: adapter.sourceId, rowId: entry.rowId });
  }, [adapter, entry.rowId, onOpen, renaming]);

  const startRename = useCallback(() => {
    if (!onRename) return;
    setRenameValue(entry.name);
    setRenaming(true);
  }, [entry.name, onRename]);

  const cancelRename = useCallback(() => {
    setRenaming(false);
    setRenameValue(entry.name);
  }, [entry.name]);

  const commitRename = useCallback(async () => {
    if (!onRename) {
      cancelRename();
      return;
    }
    const next = renameValue.trim();
    if (!next || next === entry.name) {
      cancelRename();
      return;
    }
    setRenamingBusy(true);
    try {
      await onRename(entry.rowId, next, entry.updatedAt);
    } catch {
      // toast surfaced upstream
    } finally {
      setRenamingBusy(false);
      setRenaming(false);
    }
  }, [cancelRename, entry.name, entry.rowId, entry.updatedAt, onRename, renameValue]);

  const handleCopyPath = useCallback(() => {
    void navigator.clipboard
      .writeText(`${adapter.tabIdPrefix}${entry.rowId}`)
      .then(() => toast.success("Tab id copied"))
      .catch(() => toast.error("Clipboard blocked"));
  }, [adapter.tabIdPrefix, entry.rowId]);

  return (
    <div className="select-none">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="treeitem"
            aria-expanded={adapter.multiField ? expanded : undefined}
            aria-selected={selfActive}
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (renaming) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              } else if (e.key === "F2" && onRename) {
                e.preventDefault();
                startRename();
              }
            }}
            className={cn(
              "flex items-center gap-1 text-[13px] rounded-sm",
              ROW_HEIGHT,
              TEXT_BODY,
              !renaming && "cursor-pointer",
              !renaming && HOVER_ROW,
              selfActive && !renaming && ACTIVE_ROW,
              renaming && "bg-card outline outline-1 outline-blue-400",
            )}
            style={{ paddingLeft: 8 + depth * 12 }}
            title={entry.description ?? entry.name}
          >
            {adapter.multiField ? (
              <ChevronRight
                size={12}
                className={cn(
                  "shrink-0 text-neutral-500 transition-transform",
                  expanded && "rotate-90",
                  !fields?.length && "opacity-30",
                )}
              />
            ) : (
              <span className="inline-block w-3" />
            )}
            <FileIcon name={renaming ? renameValue : entry.name} kind="file" />
            {renaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitRename();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelRename();
                  }
                }}
                onBlur={() => void commitRename()}
                disabled={renaming_busy}
                className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none"
              />
            ) : (
              <span className="truncate">{entry.name}</span>
            )}
            {!renaming && entry.badge && (
              <span className="ml-auto rounded bg-neutral-200 px-1 py-0 text-[10px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {entry.badge}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {onRename && (
            <ContextMenuItem onSelect={startRename}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
              <span className="ml-auto text-[10px] text-muted-foreground">F2</span>
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={handleCopyPath}>
            <CopyIcon className="mr-2 h-3.5 w-3.5" /> Copy tab id
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void onRefresh()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh source
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {adapter.multiField && expanded && fields && fields.length > 0 && (
        <div role="group">
          {fields.map((field) => (
            <SourceFieldLeaf
              key={field.fieldId}
              adapter={adapter}
              entry={entry}
              field={field}
              depth={depth + 1}
              activeTabId={activeTabId}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

interface SourceFieldLeafProps {
  adapter: LibrarySourceAdapter;
  entry: SourceEntry;
  field: SourceEntryField;
  depth: number;
  activeTabId: string | null;
  onOpen: (args: { sourceId: string; rowId: string; fieldId?: string }) => void;
}

const SourceFieldLeaf: React.FC<SourceFieldLeafProps> = ({
  adapter,
  entry,
  field,
  depth,
  activeTabId,
  onOpen,
}) => {
  const leafName = `${field.fieldId}.${field.extension}`;
  const tabId = adapter.makeTabId(entry.rowId, field.fieldId);
  const active = tabId === activeTabId;

  const handleOpen = useCallback(() => {
    onOpen({
      sourceId: adapter.sourceId,
      rowId: entry.rowId,
      fieldId: field.fieldId,
    });
  }, [adapter.sourceId, entry.rowId, field.fieldId, onOpen]);

  return (
    <div
      role="treeitem"
      aria-selected={active}
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
      className={cn(
        "flex items-center gap-1 text-[13px] cursor-pointer rounded-sm",
        ROW_HEIGHT,
        TEXT_BODY,
        HOVER_ROW,
        active && ACTIVE_ROW,
        !field.hasContent && "text-neutral-500",
      )}
      style={{ paddingLeft: 8 + depth * 12 }}
      title={
        field.hasContent
          ? `${field.label}: ${leafName}`
          : `${field.label} (empty — click to create)`
      }
    >
      <span className="inline-block w-3" />
      <FileIcon name={leafName} kind="file" />
      <span className="truncate">{field.label}</span>
      {!field.hasContent && (
        <span className="ml-auto text-[10px] italic text-neutral-500">
          empty
        </span>
      )}
    </div>
  );
};
