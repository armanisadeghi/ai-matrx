/**
 * features/files/components/surfaces/dropbox/BulkActionsBar.tsx
 *
 * Bottom-anchored toolbar that appears whenever one or more rows are
 * checkbox-selected in the file list. Mirrors Dropbox / Drive: a sticky strip
 * with a clear count, a few high-signal actions, and a way to dismiss the
 * selection without firing anything.
 *
 * Backend caveat: the Python backend doesn't expose bulk endpoints yet
 * (logged in PYTHON_TEAM_COMMS.md). We fan out per-file with a small
 * concurrency limit so we don't hammer the server. Folder deletion isn't
 * exposed as a bulk operation yet either, so this bar operates on file IDs
 * only — selected folders are skipped with a transient note.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  FolderInput,
  Globe,
  Loader2,
  Lock,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  selectAllFilesMap,
  selectAllFoldersMap,
  selectSelection,
} from "@/features/files/redux/selectors";
import { clearSelection } from "@/features/files/redux/slice";
import {
  deleteFile as deleteFileThunk,
  deleteFolder as deleteFolderThunk,
  getSignedUrl as getSignedUrlThunk,
  moveFile as moveFileThunk,
  updateFileMetadata,
  updateFolder as updateFolderThunk,
} from "@/features/files/redux/thunks";
import { openFolderPicker } from "@/features/files/components/pickers/CloudFilesPickerHost";
import { ingestFile } from "@/features/rag/api/ingest";
import { clearFileDocumentCache } from "@/features/files/api/document-lookup";
import type { Visibility } from "@/features/files/types";

const MAX_PARALLEL = 4;
/**
 * Mime types we know are useless to RAG-ingest. Images / video / audio /
 * archives have no text we can chunk, so silently skip them in bulk
 * reprocess and report the count back via the transient note.
 */
const NON_INGESTABLE_MIME_PREFIXES = ["image/", "video/", "audio/"];

export function BulkActionsBar({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const selection = useAppSelector(selectSelection);
  const filesById = useAppSelector(selectAllFilesMap);
  const foldersById = useAppSelector(selectAllFoldersMap);

  const [busyKind, setBusyKind] = useState<
    "download" | "move" | "delete" | "visibility" | "reprocess" | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transientNote, setTransientNote] = useState<string | null>(null);

  // Split the selected ids into files vs folders. We only support bulk file
  // operations right now — folders fall back to per-row actions until the
  // backend gains bulk endpoints (PYTHON_TEAM_COMMS Phase 12).
  const { selectedFileIds, selectedFolderIds } = useMemo(() => {
    const fileIds: string[] = [];
    const folderIds: string[] = [];
    for (const id of selection.selectedIds) {
      if (filesById[id]) fileIds.push(id);
      else if (foldersById[id]) folderIds.push(id);
    }
    return { selectedFileIds: fileIds, selectedFolderIds: folderIds };
  }, [selection.selectedIds, filesById, foldersById]);

  const totalCount = selection.selectedIds.length;
  const hasFiles = selectedFileIds.length > 0;
  const hasAny = totalCount > 0;

  const showFolderNote = useCallback(
    (verb: string) => {
      if (selectedFolderIds.length === 0) return;
      const noun =
        selectedFolderIds.length === 1
          ? "1 folder was"
          : `${selectedFolderIds.length} folders were`;
      setTransientNote(
        `${noun} skipped — bulk ${verb} for folders is coming soon.`,
      );
      window.setTimeout(() => setTransientNote(null), 4500);
    },
    [selectedFolderIds.length],
  );

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    dispatch(clearSelection());
  }, [dispatch]);

  const handleDownload = useCallback(async () => {
    if (!hasFiles || busyKind) return;
    setBusyKind("download");
    showFolderNote("download");
    try {
      // Fan-out to /files/{id}/url with bounded concurrency, then trigger a
      // hidden-anchor click for each. Browsers handle the queue. We avoid
      // window.open() which would be blocked as a popup.
      //
      // FUTURE: /files/{id}/url returns a signed INLINE URL; depending on
      // mime type some files render in the tab instead of downloading. Once
      // the asset endpoint is hooked into the bulk flow we should switch to
      // `asset.variants.original.download_url` (forces Content-Disposition:
      // attachment server-side). The single-file ActionBar already prefers
      // /files/{id}/download via `useFileActions.download` for this reason.
      // The bulk fan-out keeps the signed-URL path for now to avoid N
      // round-trips to the asset endpoint just to pick a different URL key.
      await runWithConcurrency(selectedFileIds, MAX_PARALLEL, async (id) => {
        const result = await dispatch(
          getSignedUrlThunk({ fileId: id, expiresIn: 3600 }),
        );
        const url = (result as { payload?: { url?: string } } | undefined)
          ?.payload?.url;
        if (!url) return;
        const a = document.createElement("a");
        a.href = url;
        a.rel = "noopener noreferrer";
        a.download = filesById[id]?.fileName ?? "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    } finally {
      setBusyKind(null);
    }
  }, [
    busyKind,
    dispatch,
    filesById,
    hasFiles,
    selectedFileIds,
    showFolderNote,
  ]);

  const handleMove = useCallback(async () => {
    if (!hasAny || busyKind) return;
    const target = await openFolderPicker({
      title: `Move ${totalCount} ${totalCount === 1 ? "item" : "items"} to folder`,
      description: "Choose a destination folder.",
    });
    // openFolderPicker returns undefined if cancelled (null = root).
    if (target === undefined) return;
    setBusyKind("move");
    try {
      // Files: moveFile thunk. Folders: updateFolder with parentId patch.
      // Skip folders being moved into themselves or one of their descendants
      // (the parent thunk would either fail server-side or cause a cycle).
      const isDescendantOf = (candidate: string, ancestor: string) => {
        let cursor: string | null = candidate;
        const seen = new Set<string>();
        while (cursor && !seen.has(cursor)) {
          if (cursor === ancestor) return true;
          seen.add(cursor);
          cursor = foldersById[cursor]?.parentId ?? null;
        }
        return false;
      };
      await runWithConcurrency(selectedFileIds, MAX_PARALLEL, async (id) => {
        await dispatch(
          moveFileThunk({ fileId: id, newParentFolderId: target }),
        ).unwrap();
      });
      await runWithConcurrency(selectedFolderIds, MAX_PARALLEL, async (id) => {
        if (target !== null && isDescendantOf(target, id)) return; // cycle
        if (foldersById[id]?.parentId === target) return; // no-op
        await dispatch(
          updateFolderThunk({ folderId: id, patch: { parentId: target } }),
        ).unwrap();
      });
      dispatch(clearSelection());
    } finally {
      setBusyKind(null);
    }
  }, [
    busyKind,
    dispatch,
    foldersById,
    hasAny,
    selectedFileIds,
    selectedFolderIds,
    totalCount,
  ]);

  const handleDelete = useCallback(async () => {
    if (!hasAny || busyKind) return;
    setConfirmDelete(false);
    setBusyKind("delete");
    try {
      await runWithConcurrency(selectedFileIds, MAX_PARALLEL, async (id) => {
        await dispatch(deleteFileThunk({ fileId: id })).unwrap();
      });
      await runWithConcurrency(selectedFolderIds, MAX_PARALLEL, async (id) => {
        await dispatch(deleteFolderThunk({ folderId: id })).unwrap();
      });
      dispatch(clearSelection());
    } finally {
      setBusyKind(null);
    }
  }, [busyKind, dispatch, hasAny, selectedFileIds, selectedFolderIds]);

  const handleVisibility = useCallback(
    async (visibility: Visibility) => {
      if (!hasAny || busyKind) return;
      setBusyKind("visibility");
      try {
        await runWithConcurrency(selectedFileIds, MAX_PARALLEL, async (id) => {
          await dispatch(
            updateFileMetadata({ fileId: id, patch: { visibility } }),
          ).unwrap();
        });
        await runWithConcurrency(
          selectedFolderIds,
          MAX_PARALLEL,
          async (id) => {
            await dispatch(
              updateFolderThunk({ folderId: id, patch: { visibility } }),
            ).unwrap();
          },
        );
      } finally {
        setBusyKind(null);
      }
    },
    [busyKind, dispatch, hasAny, selectedFileIds, selectedFolderIds],
  );

  // ─── RAG: bulk reprocess for selected files ─────────────────────────────
  //
  // Fan out `/rag/ingest` calls (non-streaming — bulk is fire-and-forget;
  // per-file streaming progress would crowd the UI). Skip:
  //   - virtual-source files (notes/code/agent-app rows are ingested
  //     via their own `source_kind`, not the cld_file path)
  //   - obviously non-ingestable mimes (images / video / audio)
  // Report skipped counts in the same transient note we already use for
  // folder skips, so the user understands what happened.
  const handleReprocess = useCallback(async () => {
    if (!hasFiles || busyKind) return;
    setBusyKind("reprocess");

    let ingestable: string[] = [];
    let skippedVirtual = 0;
    let skippedKind = 0;
    for (const id of selectedFileIds) {
      const f = filesById[id];
      if (!f) continue;
      if (f.source.kind === "virtual") {
        skippedVirtual++;
        continue;
      }
      const mime = f.mimeType ?? "";
      if (NON_INGESTABLE_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
        skippedKind++;
        continue;
      }
      ingestable.push(id);
    }

    let succeeded = 0;
    let failed = 0;
    try {
      await runWithConcurrency(ingestable, MAX_PARALLEL, async (id) => {
        try {
          await ingestFile(id);
          clearFileDocumentCache(id);
          if (typeof window !== "undefined") {
            // Notify any open <DocumentTab/> for this file to re-probe.
            window.dispatchEvent(
              new CustomEvent("cloud-files:document-processed", {
                detail: { fileId: id },
              }),
            );
          }
          succeeded++;
        } catch {
          failed++;
        }
      });

      const parts: string[] = [];
      parts.push(
        `Reprocessed ${succeeded} ${succeeded === 1 ? "file" : "files"} for RAG`,
      );
      if (failed > 0) parts.push(`${failed} failed`);
      if (skippedVirtual > 0) parts.push(`${skippedVirtual} virtual skipped`);
      if (skippedKind > 0) parts.push(`${skippedKind} non-text skipped`);
      setTransientNote(parts.join(" · "));
      window.setTimeout(() => setTransientNote(null), 5000);
    } finally {
      setBusyKind(null);
    }
  }, [busyKind, filesById, hasFiles, selectedFileIds]);

  // Hidden when nothing is selected. Mounting is conditional in the parent;
  // this guard is belt-and-suspenders.
  if (totalCount === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed bottom-4 left-1/2 z-30 -translate-x-1/2 flex max-w-[min(95vw,52rem)] items-center gap-2 rounded-full border border-border bg-card/95 backdrop-blur px-2 py-1.5 shadow-lg",
        className,
      )}
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="px-2 text-sm font-medium tabular-nums">
        {totalCount} selected
      </span>
      <span className="h-5 w-px bg-border" />

      <BulkActionButton
        icon={<Download className="h-3.5 w-3.5" />}
        label="Download"
        onClick={handleDownload}
        running={busyKind === "download"}
        disabled={!hasFiles || busyKind !== null}
      />
      <BulkActionButton
        icon={<FolderInput className="h-3.5 w-3.5" />}
        label="Move…"
        onClick={handleMove}
        running={busyKind === "move"}
        disabled={!hasAny || busyKind !== null}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={!hasAny || busyKind !== null}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "text-foreground hover:bg-accent",
            )}
          >
            {busyKind === "visibility" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            Visibility
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-44">
          <DropdownMenuItem onClick={() => void handleVisibility("private")}>
            <Lock className="mr-2 h-4 w-4" /> Private
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleVisibility("shared")}>
            <Users className="mr-2 h-4 w-4" /> Shared
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleVisibility("public")}>
            <Globe className="mr-2 h-4 w-4" /> Public
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <BulkActionButton
        icon={<Star className="h-3.5 w-3.5" />}
        label="Reprocess for RAG"
        onClick={handleReprocess}
        running={busyKind === "reprocess"}
        disabled={!hasFiles || busyKind !== null}
        title="Re-run extract/clean/chunk/embed on each selected file. Skips images, audio, video, and virtual sources."
      />
      <BulkActionButton
        icon={<Trash2 className="h-3.5 w-3.5" />}
        label="Delete"
        onClick={() => setConfirmDelete(true)}
        running={busyKind === "delete"}
        disabled={!hasAny || busyKind !== null}
        tone="destructive"
      />

      <span className="h-5 w-px bg-border" />
      <button
        type="button"
        onClick={handleClear}
        className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
        Cancel
      </button>

      {transientNote ? (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning whitespace-nowrap">
          <AlertCircle className="h-3 w-3" />
          {transientNote}
        </div>
      ) : null}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {totalCount} {totalCount === 1 ? "item" : "items"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedFolderIds.length > 0 && selectedFileIds.length > 0
                ? `${selectedFileIds.length} file${selectedFileIds.length === 1 ? "" : "s"} and ${selectedFolderIds.length} folder${selectedFolderIds.length === 1 ? "" : "s"} (with all contents) will move to Trash. You can restore them later.`
                : selectedFolderIds.length > 0
                  ? "Folders will be moved to Trash along with all of their contents. You can restore them later."
                  : "These files will move to Trash. You can restore them for 30 days before bytes are removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

interface BulkActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  running?: boolean;
  disabled?: boolean;
  tone?: "default" | "destructive";
  title?: string;
}

function BulkActionButton({
  icon,
  label,
  onClick,
  running,
  disabled,
  tone = "default",
  title,
}: BulkActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        tone === "destructive"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-accent",
      )}
    >
      {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Runs `worker(item)` for each item with a bounded concurrency. Errors on a
 * single item are caught + logged so one failure doesn't abort the rest;
 * caller is expected to surface aggregate state via Redux.
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        try {
          await worker(items[i]);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[BulkActionsBar] item failed:", err);
        }
      }
    },
  );
  await Promise.all(runners);
}
