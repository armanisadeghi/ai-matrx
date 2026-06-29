"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Pencil,
  Trash2,
  Copy as CopyIcon,
  Download,
  RefreshCw,
  FilePlus,
  FolderPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { FilesystemAdapter } from "../../adapters/FilesystemAdapter";
import type { FilesystemNode } from "../../types";
import { FileIcon } from "../../styles/file-icon";
import { extractErrorMessage } from "@/utils/errors";
import {
  ACTIVE_ROW,
  HOVER_ROW,
  ROW_HEIGHT,
  TEXT_BODY,
} from "../../styles/tokens";
import { useDirectoryVersion, useInvalidateDirectory } from "./FileTreeWatcher";

interface FileTreeNodeProps {
  node: FilesystemNode;
  depth: number;
  adapter: FilesystemAdapter;
  isExpanded: (path: string) => boolean;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
  activePath: string | null;
}

type CreateKind = "file" | "directory";

interface PendingCreate {
  kind: CreateKind;
  initialName: string;
}

function parentOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

function joinPath(parent: string, name: string): string {
  return `${parent.replace(/\/+$/, "")}/${name}`;
}

export const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  depth,
  adapter,
  isExpanded,
  onToggle,
  onOpenFile,
  activePath,
}) => {
  const expanded = isExpanded(node.path);
  const isDir = node.kind === "directory";
  const [children, setChildren] = useState<FilesystemNode[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Refetch when a watch event invalidates this directory.
  const version = useDirectoryVersion(node.path);
  const invalidate = useInvalidateDirectory();

  // Editing state — exactly one of these is non-null at a time.
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(
    null,
  );
  const [createValue, setCreateValue] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isDir || !expanded) return undefined;
    adapter
      .listChildren(node.path)
      .then((list) => {
        if (!cancelled) {
          setChildren(list);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [isDir, expanded, adapter, node.path, version]);

  // Auto-focus the rename / create input when it appears.
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);
  useEffect(() => {
    if (pendingCreate && createInputRef.current) {
      createInputRef.current.focus();
      // Highlight everything except the file extension so the user can
      // type the basename without retyping `.tsx` etc.
      const dot = pendingCreate.initialName.lastIndexOf(".");
      if (dot > 0) {
        createInputRef.current.setSelectionRange(0, dot);
      } else {
        createInputRef.current.select();
      }
    }
  }, [pendingCreate]);

  const handleClick = useCallback(() => {
    if (renaming) return;
    if (isDir) onToggle(node.path);
    else onOpenFile(node.path);
  }, [isDir, node.path, onOpenFile, onToggle, renaming]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (renaming) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      } else if (e.key === "ArrowRight" && isDir && !expanded) {
        e.preventDefault();
        onToggle(node.path);
      } else if (e.key === "ArrowLeft" && isDir && expanded) {
        e.preventDefault();
        onToggle(node.path);
      } else if (e.key === "F2") {
        e.preventDefault();
        startRename();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Backspace alone shouldn't delete — guard on a modifier so the
        // user has to mean it.
        if (e.key === "Delete" || e.metaKey || e.ctrlKey) {
          e.preventDefault();
          setConfirmingDelete(true);
        }
      }
    },
    [handleClick, isDir, expanded, node.path, onToggle, renaming],
  );

  // ── Drop zone (existing behaviour preserved) ────────────────────────────
  const [dragOver, setDragOver] = useState(false);
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isDir || !adapter.upload) return;
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      }
    },
    [isDir, adapter],
  );
  const handleDragLeave = useCallback(() => {
    if (dragOver) setDragOver(false);
  }, [dragOver]);
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!isDir || !adapter.upload) return;
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      const dirPath = node.path.replace(/\/$/, "");
      try {
        for (const file of files) {
          const target = `${dirPath}/${file.name}`;
          await adapter.upload!(target, file);
        }
        if (!expanded) onToggle(node.path);
        invalidate(node.path);
      } catch (err) {
        setLoadError(extractErrorMessage(err));
      }
    },
    [isDir, adapter, node.path, expanded, onToggle, invalidate],
  );

  // ── Action handlers ─────────────────────────────────────────────────────
  const startRename = useCallback(() => {
    setRenameValue(node.name);
    setRenaming(true);
  }, [node.name]);

  const cancelRename = useCallback(() => {
    setRenaming(false);
    setRenameValue(node.name);
  }, [node.name]);

  const commitRename = useCallback(async () => {
    const next = renameValue.trim();
    if (!next || next === node.name) {
      cancelRename();
      return;
    }
    if (!adapter.rename) {
      toast.error("Rename not supported by this filesystem.");
      cancelRename();
      return;
    }
    setBusy(true);
    try {
      const newPath = joinPath(parentOf(node.path), next);
      await adapter.rename(node.path, newPath, false);
      toast.success(`Renamed to ${next}`);
      invalidate(parentOf(node.path));
    } catch (err) {
      toast.error(`Rename failed: ${extractErrorMessage(err)}`);
    } finally {
      setBusy(false);
      setRenaming(false);
    }
  }, [adapter, cancelRename, invalidate, node.name, node.path, renameValue]);

  const handleDelete = useCallback(async () => {
    if (!adapter.delete) {
      toast.error("Delete not supported by this filesystem.");
      setConfirmingDelete(false);
      return;
    }
    setBusy(true);
    try {
      await adapter.delete(node.path, isDir);
      toast.success(`Deleted ${node.name}`);
      invalidate(parentOf(node.path));
    } catch (err) {
      toast.error(`Delete failed: ${extractErrorMessage(err)}`);
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  }, [adapter, invalidate, isDir, node.name, node.path]);

  const handleCopyPath = useCallback(() => {
    void navigator.clipboard
      .writeText(node.path)
      .then(() => toast.success("Path copied"))
      .catch(() => toast.error("Clipboard blocked"));
  }, [node.path]);

  const handleDownload = useCallback(async () => {
    if (!adapter.download) {
      toast.error("Download not supported by this filesystem.");
      return;
    }
    setBusy(true);
    try {
      const blob = await adapter.download(node.path);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = node.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Download failed: ${extractErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }, [adapter, node.name, node.path]);

  const handleRefresh = useCallback(() => {
    invalidate(node.path);
  }, [invalidate, node.path]);

  const startCreate = useCallback(
    (kind: CreateKind) => {
      // Only directories accept new children. Auto-expand so the user sees
      // the input field immediately.
      if (!isDir) return;
      if (!expanded) onToggle(node.path);
      const initialName =
        kind === "file" ? "untitled.txt" : "new-folder";
      setPendingCreate({ kind, initialName });
      setCreateValue(initialName);
    },
    [expanded, isDir, node.path, onToggle],
  );

  const cancelCreate = useCallback(() => {
    setPendingCreate(null);
    setCreateValue("");
  }, []);

  const commitCreate = useCallback(async () => {
    if (!pendingCreate) return;
    const name = createValue.trim();
    if (!name) {
      cancelCreate();
      return;
    }
    const targetPath = joinPath(node.path, name);
    setBusy(true);
    try {
      if (pendingCreate.kind === "file") {
        if (!adapter.writeFile) throw new Error("writeFile not supported");
        await adapter.writeFile(targetPath, "");
        toast.success(`Created ${name}`);
        // Open the new file in the editor for immediate editing.
        onOpenFile(targetPath);
      } else {
        if (!adapter.mkdir) throw new Error("mkdir not supported");
        await adapter.mkdir(targetPath, true);
        toast.success(`Created ${name}/`);
      }
      invalidate(node.path);
    } catch (err) {
      toast.error(
        `Create failed: ${extractErrorMessage(err)}`,
      );
    } finally {
      setBusy(false);
      setPendingCreate(null);
      setCreateValue("");
    }
  }, [
    adapter,
    cancelCreate,
    createValue,
    invalidate,
    node.path,
    onOpenFile,
    pendingCreate,
  ]);

  const indentStyle = { paddingLeft: 8 + depth * 12 };
  const childIndentStyle = { paddingLeft: 8 + (depth + 1) * 12 };

  return (
    <div className="select-none">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="treeitem"
            aria-expanded={isDir ? expanded : undefined}
            aria-selected={activePath === node.path}
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => void handleDrop(e)}
            className={cn(
              "flex items-center gap-1 text-[13px]",
              ROW_HEIGHT,
              TEXT_BODY,
              !renaming && HOVER_ROW,
              activePath === node.path && !renaming && ACTIVE_ROW,
              dragOver &&
                "bg-blue-100 outline outline-1 outline-blue-400 dark:bg-blue-950/60",
              !renaming && "cursor-pointer rounded-sm",
              renaming && "rounded-sm bg-card outline outline-1 outline-blue-400",
            )}
            style={indentStyle}
          >
            {isDir ? (
              <ChevronRight
                size={12}
                className={cn(
                  "shrink-0 text-neutral-500 transition-transform",
                  expanded && "rotate-90",
                )}
              />
            ) : (
              <span className="inline-block w-3" />
            )}
            <FileIcon name={node.name} kind={node.kind} expanded={expanded} />
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
                disabled={busy}
                className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none"
              />
            ) : (
              <span className="truncate">{node.name}</span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {isDir && (
            <>
              <ContextMenuItem onSelect={() => startCreate("file")}>
                <FilePlus className="mr-2 h-3.5 w-3.5" /> New file
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => startCreate("directory")}>
                <FolderPlus className="mr-2 h-3.5 w-3.5" /> New folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onSelect={startRename}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
            <span className="ml-auto text-[10px] text-muted-foreground">F2</span>
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => setConfirmingDelete(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            <span className="ml-auto text-[10px] text-muted-foreground">⌫</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={handleCopyPath}>
            <CopyIcon className="mr-2 h-3.5 w-3.5" /> Copy path
          </ContextMenuItem>
          {!isDir && (
            <ContextMenuItem onSelect={() => void handleDownload()}>
              <Download className="mr-2 h-3.5 w-3.5" /> Download
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={handleRefresh}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Inline "new file / new folder" input — only renders when this node
       *  is a directory in `pendingCreate` state. The input lives at the top
       *  of the children list so the user sees it inside the tree where they
       *  expect. */}
      {isDir && expanded && pendingCreate && (
        <div
          className="flex items-center gap-1 text-[13px]"
          style={childIndentStyle}
        >
          <span className="inline-block w-3" />
          <FileIcon
            name={createValue}
            kind={pendingCreate.kind === "directory" ? "directory" : "file"}
            expanded={false}
          />
          <input
            ref={createInputRef}
            type="text"
            value={createValue}
            onChange={(e) => setCreateValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitCreate();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelCreate();
              }
            }}
            onBlur={() => void commitCreate()}
            disabled={busy}
            className="min-w-0 flex-1 rounded-sm bg-card font-mono text-[13px] outline outline-1 outline-blue-400"
          />
        </div>
      )}

      {isDir && expanded && (
        <div role="group">
          {loadError && (
            <div
              className="px-2 text-[11px] text-red-500"
              style={childIndentStyle}
            >
              {loadError}
            </div>
          )}
          {children === null && !loadError && (
            <div
              className="px-2 text-[11px] text-neutral-500"
              style={childIndentStyle}
            >
              Loading…
            </div>
          )}
          {children?.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              adapter={adapter}
              isExpanded={isExpanded}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              activePath={activePath}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmingDelete(false);
        }}
        title={`Delete ${isDir ? "folder" : "file"}`}
        description={
          <>
            Permanently delete <strong className="font-mono">{node.name}</strong>
            {isDir ? " and everything inside it" : ""}? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={busy}
        onConfirm={handleDelete}
      />
    </div>
  );
};
