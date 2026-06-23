"use client";

/**
 * CodeFileManagerWindow
 *
 * Window for browsing, organizing, and managing a user's saved code files.
 * This is NOT an editor — opening a file dispatches openCodeEditorWindow so
 * editing happens in the dedicated CodeEditorWindow.
 *
 * Structure (thin composition root — chrome lives in WindowPanel slots, not
 * stacked bars inside the body):
 *   - sidebar      → Folder tree with counts + root "Unfiled" bucket.
 *   - actionsRight → Search + sort + New (persistent header controls).
 *   - footerLeft   → Folder context + file count.
 *   - footerRight  → Selection actions (Open / Delete / Clear), selection-gated.
 *   - body         → ONLY the scrollable file list for the selected folder.
 *
 * All state + actions flow through useCodeFileManager. Redux owns persistence.
 */

import React, { useCallback, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  Search,
  Trash2,
  Pencil,
  ArrowUpDown,
  FileCode2,
  Loader2,
  Inbox,
} from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { cn } from "@/lib/utils";
import { getLanguageIconNode } from "@/features/code-editor/components/code-block/LanguageDisplay";
import {
  useCodeFileManager,
  ROOT_FOLDER_ID,
  type FolderNode,
  type SortBy,
} from "./useCodeFileManager";
import type { CodeFileRecord } from "@/features/code-files/redux/code-files.types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CodeFileManagerWindowProps {
  windowInstanceId: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CodeFileManagerWindow({
  windowInstanceId,
  onClose,
}: CodeFileManagerWindowProps) {
  const mgr = useCodeFileManager();

  // ── Dialog state (new folder, rename) ─────────────────────────────────────
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(
    null,
  );

  const [renameDialog, setRenameDialog] = useState<{
    kind: "file" | "folder";
    id: string;
    current: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [confirmDelete, setConfirmDelete] = useState<{
    kind: "file" | "folder" | "selection";
    id?: string;
    label: string;
  } | null>(null);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleCreateFolderSubmit = useCallback(async () => {
    if (!newFolderName.trim()) return;
    await mgr.createNewFolder(newFolderName, newFolderParentId);
    setNewFolderOpen(false);
    setNewFolderName("");
    setNewFolderParentId(null);
  }, [mgr, newFolderName, newFolderParentId]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renameDialog || !renameValue.trim()) return;
    if (renameDialog.kind === "file") {
      await mgr.renameFile(renameDialog.id, renameValue);
    } else {
      await mgr.renameFolder(renameDialog.id, renameValue);
    }
    setRenameDialog(null);
    setRenameValue("");
  }, [mgr, renameDialog, renameValue]);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete) return;
    if (confirmDelete.kind === "file" && confirmDelete.id) {
      await mgr.deleteFile(confirmDelete.id);
    } else if (confirmDelete.kind === "folder" && confirmDelete.id) {
      await mgr.deleteFolder(confirmDelete.id);
    } else if (confirmDelete.kind === "selection") {
      await mgr.deleteSelectedFiles();
    }
    setConfirmDelete(null);
  }, [confirmDelete, mgr]);

  const handleCreateNewFile = useCallback(async () => {
    const id = await mgr.createNewFile();
    if (id) {
      mgr.openFileIdsInEditor([id], "Code Editor");
    }
  }, [mgr]);

  const handleOpenFile = useCallback(
    (file: CodeFileRecord) => {
      mgr.openFileIdsInEditor([file.id], file.name);
    },
    [mgr],
  );

  const handleOpenSelected = useCallback(() => {
    if (mgr.selectedFileIds.length === 0) return;
    mgr.openFileIdsInEditor(mgr.selectedFileIds, "Code Editor");
    mgr.clearFileSelection();
  }, [mgr]);

  // ── Sidebar content ───────────────────────────────────────────────────────
  const sidebar = (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          <Folder className="h-3.5 w-3.5" />
          Folders
        </div>
        <button
          type="button"
          onClick={() => {
            setNewFolderParentId(null);
            setNewFolderOpen(true);
          }}
          title="New folder"
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {mgr.isLoadingFolders ? (
          <div className="flex items-center justify-center h-24 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            Loading…
          </div>
        ) : (
          <FolderTree
            nodes={mgr.tree}
            depth={0}
            selectedId={mgr.selectedFolderId}
            onSelect={mgr.setSelectedFolderId}
            isExpanded={mgr.isFolderExpanded}
            onToggleExpand={mgr.toggleFolderExpanded}
            onRequestNewFolder={(parentId) => {
              setNewFolderParentId(parentId);
              setNewFolderOpen(true);
            }}
            onRequestRename={(id, name) => {
              setRenameDialog({ kind: "folder", id, current: name });
              setRenameValue(name);
            }}
            onRequestDelete={(id, name) =>
              setConfirmDelete({ kind: "folder", id, label: name })
            }
          />
        )}
      </div>
    </div>
  );

  // ── Header / footer slots ──────────────────────────────────────────────────
  // Global chrome lives in WindowPanel slots, not stacked bars inside the body:
  //   - actionsRight → search + sort + New      (persistent window controls)
  //   - footerLeft   → folder context + count   (status, like NoteMetadataBar)
  //   - footerRight  → selection actions        (only when files are selected)
  // The body holds ONLY the scrollable file list. All controls read/write the
  // `mgr` hook (owned here, the composition root) — no state hoisting needed.
  const selectedFolderName =
    mgr.selectedFolderId === null
      ? mgr.searchQuery
        ? `Search results for "${mgr.searchQuery}"`
        : "Unfiled"
      : (mgr.folders.find((f) => f.id === mgr.selectedFolderId)?.name ??
        "Folder");

  const headerActions = (
    <div className="flex items-center gap-1.5">
      <div className="relative w-44">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={mgr.searchQuery}
          onChange={(e) => mgr.setSearchQuery(e.target.value)}
          placeholder="Search files…"
          className="w-full pl-7 pr-2 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
        />
      </div>
      <SortButton value={mgr.sortBy} onChange={mgr.setSortBy} />
      <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
      <button
        type="button"
        onClick={handleCreateNewFile}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        title="New file"
      >
        <FilePlus className="h-3.5 w-3.5" />
        New
      </button>
    </div>
  );

  const folderContext = (
    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 min-w-0 truncate">
      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{selectedFolderName}</span>
      <span className="text-gray-400 dark:text-gray-600">
        ({mgr.visibleFiles.length})
      </span>
    </div>
  );

  const selectionActions =
    mgr.selectedFileIds.length > 0 ? (
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {mgr.selectedFileIds.length} selected
        </span>
        <button
          type="button"
          onClick={handleOpenSelected}
          className="px-2 py-0.5 text-[11px] rounded bg-blue-600 hover:bg-blue-700 text-white"
        >
          Open
        </button>
        <button
          type="button"
          onClick={() =>
            setConfirmDelete({
              kind: "selection",
              label: `${mgr.selectedFileIds.length} file(s)`,
            })
          }
          className="px-2 py-0.5 text-[11px] rounded bg-rose-600 hover:bg-rose-700 text-white"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={mgr.clearFileSelection}
          className="px-2 py-0.5 text-[11px] rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Clear
        </button>
      </div>
    ) : undefined;

  return (
    <>
      <WindowPanel
        id={`code-file-manager-window-${windowInstanceId}`}
        title="Code Files"
        overlayId="codeFileManagerWindow"
        minWidth={620}
        minHeight={420}
        width={980}
        height={640}
        position="center"
        onClose={onClose}
        sidebar={sidebar}
        sidebarDefaultSize={200}
        sidebarMinSize={160}
        sidebarExpandsWindow
        defaultSidebarOpen={true}
        actionsRight={headerActions}
        footerLeft={folderContext}
        footerRight={selectionActions}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        {/* Body = content only: the scrollable file list. */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-950">
          {mgr.isLoadingList ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400 gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading files…
            </div>
          ) : mgr.visibleFiles.length === 0 ? (
            <EmptyFileList
              searching={!!mgr.searchQuery}
              folderEmpty={mgr.allFilesCount === 0}
              onNewFile={handleCreateNewFile}
            />
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {mgr.visibleFiles.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  selected={mgr.selectedFileIds.includes(file.id)}
                  onToggleSelect={() => mgr.toggleFileSelection(file.id)}
                  onOpen={() => handleOpenFile(file)}
                  onRename={() => {
                    setRenameDialog({
                      kind: "file",
                      id: file.id,
                      current: file.name,
                    });
                    setRenameValue(file.name);
                  }}
                  onDelete={() =>
                    setConfirmDelete({
                      kind: "file",
                      id: file.id,
                      label: file.name,
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </WindowPanel>

      {/* ── New Folder dialog ─────────────────────────────────────────────── */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>
              {newFolderParentId
                ? `Create a folder inside "${
                    mgr.folders.find((f) => f.id === newFolderParentId)?.name ??
                    "folder"
                  }"`
                : "Create a new top-level folder."}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreateFolderSubmit();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolderSubmit}
              disabled={!newFolderName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rename dialog ─────────────────────────────────────────────────── */}
      <Dialog
        open={renameDialog !== null}
        onOpenChange={(open) => {
          if (!open) setRenameDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Rename {renameDialog?.kind === "folder" ? "folder" : "file"}
            </DialogTitle>
            <DialogDescription>
              {renameDialog?.kind === "file"
                ? "Renaming a file also updates its detected language based on the new extension."
                : "Update the folder name. Nested contents are unaffected."}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRenameSubmit();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRenameSubmit}
              disabled={
                !renameValue.trim() ||
                renameValue.trim() === renameDialog?.current
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm delete ────────────────────────────────────────────────── */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete{" "}
              {confirmDelete?.kind === "folder"
                ? "folder"
                : confirmDelete?.kind === "selection"
                  ? "files"
                  : "file"}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === "folder"
                ? `"${confirmDelete?.label}" will be hidden. Files inside keep their content but will appear as "Unfiled" until re-assigned.`
                : confirmDelete?.kind === "selection"
                  ? `${confirmDelete?.label} will be moved to trash. This cannot be undone from here.`
                  : `"${confirmDelete?.label}" will be moved to trash. This cannot be undone from here.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default CodeFileManagerWindow;

// ─── Sort button ──────────────────────────────────────────────────────────────

const SORT_LABELS: Record<SortBy, string> = {
  updated: "Updated",
  name: "Name",
  language: "Language",
};

function SortButton({
  value,
  onChange,
}: {
  value: SortBy;
  onChange: (v: SortBy) => void;
}) {
  const order: SortBy[] = ["updated", "name", "language"];
  const cycle = () => {
    const idx = order.indexOf(value);
    onChange(order[(idx + 1) % order.length]);
  };
  return (
    <button
      type="button"
      onClick={cycle}
      className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      title={`Sort: ${SORT_LABELS[value]} (click to cycle)`}
    >
      <ArrowUpDown className="h-3 w-3" />
      {SORT_LABELS[value]}
    </button>
  );
}

// ─── Folder tree ──────────────────────────────────────────────────────────────

function FolderTree({
  nodes,
  depth,
  selectedId,
  onSelect,
  isExpanded,
  onToggleExpand,
  onRequestNewFolder,
  onRequestRename,
  onRequestDelete,
}: {
  nodes: FolderNode[];
  depth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  isExpanded: (id: string) => boolean;
  onToggleExpand: (id: string) => void;
  onRequestNewFolder: (parentId: string | null) => void;
  onRequestRename: (id: string, current: string) => void;
  onRequestDelete: (id: string, name: string) => void;
}) {
  return (
    <ul className="list-none m-0 p-0">
      {nodes.map((node) => {
        const isRoot = node.id === ROOT_FOLDER_ID;
        const dbId = isRoot ? null : (node.id as string);
        const selected = selectedId === dbId;
        const hasKids = node.children.length > 0;
        const expanded = isExpanded(node.id as string);

        return (
          <li key={node.id}>
            <div
              className={cn(
                "flex items-center gap-0.5 pr-1 py-0.5 text-xs cursor-pointer group",
                selected
                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800",
              )}
              style={{ paddingLeft: 4 + depth * 10 }}
              onClick={() => onSelect(dbId)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasKids) onToggleExpand(node.id as string);
                }}
                className={cn(
                  "w-4 h-4 flex items-center justify-center text-gray-400",
                  !hasKids && "opacity-0 pointer-events-none",
                )}
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
              {isRoot ? (
                <Inbox className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              ) : expanded ? (
                <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              ) : (
                <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              )}
              <span className="flex-1 truncate">{node.name}</span>
              {node.fileCount > 0 ? (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                  {node.fileCount}
                </span>
              ) : null}
              {!isRoot ? (
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <IconButtonSmall
                    title="New subfolder"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestNewFolder(dbId);
                    }}
                  >
                    <FolderPlus className="h-3 w-3" />
                  </IconButtonSmall>
                  <IconButtonSmall
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestRename(dbId!, node.name);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </IconButtonSmall>
                  <IconButtonSmall
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDelete(dbId!, node.name);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </IconButtonSmall>
                </div>
              ) : null}
            </div>

            {expanded && hasKids ? (
              <FolderTree
                nodes={node.children}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                isExpanded={isExpanded}
                onToggleExpand={onToggleExpand}
                onRequestNewFolder={onRequestNewFolder}
                onRequestRename={onRequestRename}
                onRequestDelete={onRequestDelete}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function IconButtonSmall({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700"
    >
      {children}
    </button>
  );
}

// ─── File row ─────────────────────────────────────────────────────────────────

function FileRow({
  file,
  selected,
  onToggleSelect,
  onOpen,
  onRename,
  onDelete,
}: {
  file: CodeFileRecord;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-xs group hover:bg-gray-50 dark:hover:bg-gray-900/60 cursor-pointer",
        selected && "bg-blue-50 dark:bg-blue-900/20",
      )}
      onDoubleClick={onOpen}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggleSelect()}
        onClick={(e) => e.stopPropagation()}
        className="h-3.5 w-3.5 shrink-0"
      />
      <div className="shrink-0">
        {getLanguageIconNode(file.language, false)}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 truncate text-left text-gray-900 dark:text-gray-100 hover:underline decoration-dotted"
      >
        {file.name}
      </button>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 hidden md:inline">
        {file.language}
      </span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 tabular-nums hidden md:inline">
        {formatRelative(file.updated_at)}
      </span>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100">
        <IconButtonSmall
          title="Rename"
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
        >
          <Pencil className="h-3 w-3" />
        </IconButtonSmall>
        <IconButtonSmall
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </IconButtonSmall>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.round(mo / 12)}y`;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyFileList({
  searching,
  folderEmpty,
  onNewFile,
}: {
  searching: boolean;
  folderEmpty: boolean;
  onNewFile: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-10">
      <FileCode2 className="w-10 h-10 text-gray-300 dark:text-gray-700" />
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {searching
          ? "No files match your search."
          : folderEmpty
            ? "You haven't saved any code yet."
            : "This folder is empty."}
      </div>
      {!searching ? (
        <button
          type="button"
          onClick={onNewFile}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white"
        >
          <FilePlus className="h-3.5 w-3.5" />
          New file
        </button>
      ) : null}
    </div>
  );
}
