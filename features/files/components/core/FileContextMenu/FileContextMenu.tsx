/**
 * features/files/components/core/FileContextMenu/FileContextMenu.tsx
 *
 * Right-click / three-dot menu for a file. Headless — parent provides `open`
 * + `onOpenChange`; this component renders the menu items and invokes the
 * appropriate handler.
 *
 * Mobile: parent surfaces should not use this — they should open a Drawer
 * with the same items via [MobileFileActionsDrawer] (TBD in Phase 4).
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Copy,
  CopyPlus,
  Download,
  Edit2,
  Eye,
  FileSearch,
  FileText,
  FolderInput,
  Globe,
  History,
  Info,
  Layers,
  Lock,
  RotateCw,
  Scissors,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { Visibility } from "@/features/files/types";
import { clearSelection, setActiveFileId } from "@/features/files/redux/slice";
import {
  selectAllFilesMap,
  selectSelection,
} from "@/features/files/redux/selectors";
import {
  deleteFile as deleteFileThunk,
  getSignedUrl as getSignedUrlThunk,
  moveFile as moveFileThunk,
  uploadFiles as uploadFilesThunk,
} from "@/features/files/redux/thunks";
import { openFolderPicker } from "@/features/files/components/pickers/CloudFilesPickerHost";
import { openFilePreview } from "@/features/files/components/preview/openFilePreview";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { FileInfoDialog } from "@/features/files/components/core/FileInfo/FileInfoDialog";
import { RenameDialog } from "@/features/files/components/core/RenameDialog/RenameDialog";
import { setClipboard } from "@/features/files/utils/clipboard";

export interface FileContextMenuProps {
  fileId: string;
  children: React.ReactNode; // trigger
  onRename?: () => void;
  onShare?: () => void;
  onMove?: () => void;
  disabled?: boolean;
}

export function FileContextMenu({
  fileId,
  children,
  onRename,
  onShare,
  onMove,
  disabled,
}: FileContextMenuProps) {
  const dispatch = useAppDispatch();
  const actions = useFileActions(fileId);
  const selection = useAppSelector(selectSelection);
  const filesById = useAppSelector(selectAllFilesMap);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [busy, setBusy] = useState<"download" | "move" | "delete" | null>(null);

  // When the host doesn't supply its own rename handler, fall back to the
  // built-in RenameDialog so renaming works everywhere the menu is mounted.
  const handleRename = onRename ?? (() => setRenameOpen(true));
  const file = filesById[fileId];
  // Virtual files (Notes / Agent Apps / Code Snippets / etc.) don't go
  // through the Python `/files/{id}` REST contract, so any action that
  // depends on a signed S3 URL (Download / Copy link / Duplicate) or on
  // cld_* tables (Versions / File info / Visibility) is hidden.
  const isVirtual = file?.source.kind === "virtual";

  // When the right-clicked file is part of a multi-selection AND selection
  // has more than one item, the menu pivots to "batch actions" mode and
  // operates on the entire selection. Otherwise it's a normal single-file
  // menu (the legacy menu behaved the same way).
  const isInMulti =
    selection.selectedIds.length > 1 && selection.selectedIds.includes(fileId);
  const batchFileIds = isInMulti
    ? selection.selectedIds.filter((id) => filesById[id])
    : [];

  // Mac → ⌘, Windows / Linux → Ctrl. Used in the visual shortcut hints.
  const cmd = useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl";
    return /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘" : "Ctrl";
  }, []);

  const handleVisibility = useCallback(
    async (visibility: Visibility) => {
      await actions.setVisibility(visibility);
    },
    [actions],
  );

  // ── Batch operations (concurrent, bounded) ────────────────────────────

  const runBatch = useCallback(
    async (worker: (id: string) => Promise<void>) => {
      const limit = 4;
      let cursor = 0;
      const ids = batchFileIds;
      const runners = Array.from(
        { length: Math.min(limit, ids.length) },
        async () => {
          while (cursor < ids.length) {
            const i = cursor++;
            try {
              await worker(ids[i]);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn("[FileContextMenu] batch item failed:", err);
            }
          }
        },
      );
      await Promise.all(runners);
    },
    [batchFileIds],
  );

  const handleBatchDownload = useCallback(async () => {
    setBusy("download");
    try {
      await runBatch(async (id) => {
        const res = await dispatch(
          getSignedUrlThunk({ fileId: id, expiresIn: 3600 }),
        );
        const url = (res as { payload?: { url?: string } } | undefined)?.payload
          ?.url;
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
      setBusy(null);
    }
  }, [dispatch, filesById, runBatch]);

  const handleBatchMove = useCallback(async () => {
    const target = await openFolderPicker({
      title: `Move ${batchFileIds.length} ${
        batchFileIds.length === 1 ? "file" : "files"
      } to folder`,
      description: "Choose a destination folder.",
    });
    if (target === undefined) return;
    setBusy("move");
    try {
      await runBatch(async (id) => {
        await dispatch(
          moveFileThunk({ fileId: id, newParentFolderId: target }),
        ).unwrap();
      });
      dispatch(clearSelection());
    } finally {
      setBusy(null);
    }
  }, [batchFileIds.length, dispatch, runBatch]);

  const handleBatchDelete = useCallback(async () => {
    setBatchConfirmOpen(false);
    setBusy("delete");
    try {
      await runBatch(async (id) => {
        await dispatch(deleteFileThunk({ fileId: id })).unwrap();
      });
      dispatch(clearSelection());
    } finally {
      setBusy(null);
    }
  }, [dispatch, runBatch]);

  // ── Duplicate (client-side) ──────────────────────────────────────────
  // The backend doesn't expose a copyFile endpoint yet (logged in
  // PYTHON_TEAM_COMMS as a Phase 12 ask). For now we synthesize the
  // operation client-side: fetch via signed URL → re-upload as " (copy)".
  const handleDuplicate = useCallback(async () => {
    const file = filesById[fileId];
    if (!file) return;
    setBusy("download"); // reuse busy state — same UX (spinner on item)
    try {
      const res = await dispatch(getSignedUrlThunk({ fileId, expiresIn: 600 }));
      const url = (res as { payload?: { url?: string } } | undefined)?.payload
        ?.url;
      if (!url) throw new Error("Couldn't fetch a signed URL.");
      const blob = await fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      });
      // Insert " (copy)" before the extension so it sorts adjacent to the
      // original — `report.pdf` → `report (copy).pdf`.
      const base = file.fileName;
      const dot = base.lastIndexOf(".");
      const newName =
        dot > 0
          ? `${base.slice(0, dot)} (copy)${base.slice(dot)}`
          : `${base} (copy)`;
      const dupFile = new File([blob], newName, {
        type: file.mimeType ?? blob.type,
      });
      await dispatch(
        uploadFilesThunk({
          files: [dupFile],
          parentFolderId: file.parentFolderId,
          visibility: file.visibility,
        }),
      ).unwrap();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[FileContextMenu] duplicate failed:", err);
    } finally {
      setBusy(null);
    }
  }, [dispatch, fileId, filesById]);

  // "Show versions" / "Show details" route through the preview surface so
  // the user gets the SAME experience whether they came from a chip in a
  // chat message, a row in cloud-files, or the resource picker. Two
  // wrinkles:
  //
  //   1. If the cloud-files PageShell is mounted (user is on
  //      `/files/...`), `setActiveFileId` opens the side panel and
  //      the CustomEvent below tells it which tab to pop.
  //   2. If we're anywhere else, the side panel doesn't exist — but
  //      `openFilePreview(fileId)` opens the canonical PreviewPane
  //      inside a draggable WindowPanel via the global
  //      `filePreviewWindow` overlay. The CustomEvent fires there too;
  //      every PreviewPane subscribes regardless of host surface.
  //
  // Both dispatches are idempotent + cheap, so we always do both. The
  // CustomEvent is filtered by `fileId` inside PreviewPane.
  const openInPreview = useCallback(
    (tab: "preview" | "info" | "versions" | "edit" | "document") => {
      dispatch(setActiveFileId(fileId));
      openFilePreview(fileId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("cloud-files:open-preview-tab", {
            detail: { fileId, tab },
          }),
        );
      }
    },
    [dispatch, fileId],
  );

  const handlePreview = useCallback(
    () => openInPreview("preview"),
    [openInPreview],
  );
  const handleShowDetails = useCallback(
    () => openInPreview("info"),
    [openInPreview],
  );
  const handleShowVersions = useCallback(
    () => openInPreview("versions"),
    [openInPreview],
  );
  const handleShowDocument = useCallback(
    () => openInPreview("document"),
    [openInPreview],
  );

  // "Reprocess for RAG" — kicks off `/rag/ingest` and pops the user
  // into the Document tab so they see the streaming progress UI. This
  // is also the single entry point that flips a never-ingested file
  // from the absent state to the live viewer.
  const handleReprocess = useCallback(() => {
    openInPreview("document");
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("cloud-files:reprocess-document", {
          detail: { fileId, force: true },
        }),
      );
    }
  }, [fileId, openInPreview]);

  // "Reprocess N for RAG" — bulk variant. Fires the same per-file
  // event the single-file path uses, but in series with progress
  // toasts. Serial (not parallel) so we don't blow the matrx-orm
  // pool — that's what the dev server saw on the bulk-ingest script.
  const handleBatchReprocess = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ids = batchFileIds.length > 0 ? batchFileIds : [fileId];
    const { toast } = await import("sonner");
    const tid = toast.loading(`Reprocessing ${ids.length} files for RAG…`, {
      description: "Running serially to avoid pool saturation.",
    });
    let done = 0;
    for (const id of ids) {
      try {
        window.dispatchEvent(
          new CustomEvent("cloud-files:reprocess-document", {
            detail: { fileId: id, force: true, silent: true },
          }),
        );
        // Pace the queue so the underlying pipeline doesn't stack up.
        // The actual ingest runs async on the backend; we just throttle
        // the dispatch rate.
        await new Promise<void>((r) => setTimeout(r, 300));
        done += 1;
        toast.loading(
          `Reprocessing for RAG: ${done} / ${ids.length} dispatched`,
          { id: tid },
        );
      } catch (err) {
        toast.error(`Failed to dispatch reprocess for ${id.slice(0, 8)}…`, {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    }
    toast.success(`${done} of ${ids.length} files queued for RAG ingestion`, {
      id: tid,
      description:
        "Watch the per-file Document tab for progress. Reload the file list when done to see the new viewer links.",
    });
  }, [batchFileIds, fileId]);

  // "Open in 4-pane RAG viewer" — looks up the processed_documents row
  // anchored to this cld_files id and opens /rag/viewer/{id}. If the
  // file has never been processed, shows a toast with a hint.
  const handleOpenRagViewer = useCallback(async () => {
    try {
      const { getJson } = await import("@/features/files/api/client");
      const { data } = await getJson<{
        document_id: string | null;
        found: boolean;
      }>(`/api/document/by-cld-file/${encodeURIComponent(fileId)}`);
      if (data.found && data.document_id) {
        window.open(`/rag/viewer/${data.document_id}`, "_blank", "noopener");
      } else {
        const { toast } = await import("sonner");
        toast.info("Not yet processed for RAG", {
          description:
            'Run "Reprocess for RAG" first — the 4-pane viewer needs the per-page extraction.',
        });
      }
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error("Could not look up document", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [fileId]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {isInMulti ? (
            // Batch mode — operates on the whole selection. The single-file
            // items (Rename, Show versions, File info, Visibility) don't
            // make sense across N files, so we hide them.
            <>
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                <Layers className="h-3 w-3" />
                {batchFileIds.length}{" "}
                {batchFileIds.length === 1 ? "file" : "files"} selected
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void handleBatchDownload()}
                disabled={busy !== null}
              >
                <Download className="mr-2 h-4 w-4" />
                Download {batchFileIds.length}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void handleBatchMove()}
                disabled={busy !== null}
              >
                <FolderInput className="mr-2 h-4 w-4" />
                Move {batchFileIds.length}…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void handleBatchReprocess()}
                disabled={busy !== null}
              >
                <RotateCw className="mr-2 h-4 w-4" />
                Reprocess {batchFileIds.length} for RAG
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setBatchConfirmOpen(true)}
                disabled={busy !== null}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete {batchFileIds.length}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={handlePreview}>
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </DropdownMenuItem>
              {!isVirtual ? (
                <>
                  <DropdownMenuItem onClick={() => void actions.download()}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      void actions.copyShareUrl();
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy link
                    <DropdownMenuShortcut>{cmd}L</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  {onShare ? (
                    <DropdownMenuItem onClick={onShare}>
                      <Share2 className="mr-2 h-4 w-4" />
                      Share…
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() =>
                  setClipboard({
                    op: "cut",
                    items: [
                      {
                        id: fileId,
                        kind: "file",
                        source: isVirtual ? "virtual" : "real",
                      },
                    ],
                    setAt: Date.now(),
                  })
                }
              >
                <Scissors className="mr-2 h-4 w-4" />
                Cut
                <DropdownMenuShortcut>{cmd}X</DropdownMenuShortcut>
              </DropdownMenuItem>
              {!isVirtual ? (
                <DropdownMenuItem
                  onClick={() =>
                    setClipboard({
                      op: "copy",
                      items: [{ id: fileId, kind: "file", source: "real" }],
                      setAt: Date.now(),
                    })
                  }
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                  <DropdownMenuShortcut>{cmd}C</DropdownMenuShortcut>
                </DropdownMenuItem>
              ) : null}

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleRename}>
                <Edit2 className="mr-2 h-4 w-4" />
                Rename
                <DropdownMenuShortcut>F2</DropdownMenuShortcut>
              </DropdownMenuItem>
              {onMove ? (
                <DropdownMenuItem onClick={onMove}>
                  <FolderInput className="mr-2 h-4 w-4" />
                  Move…
                </DropdownMenuItem>
              ) : null}
              {!isVirtual ? (
                <>
                  <DropdownMenuItem
                    onClick={() => void handleDuplicate()}
                    disabled={busy !== null}
                  >
                    <CopyPlus className="mr-2 h-4 w-4" />
                    Duplicate
                    <DropdownMenuShortcut>{cmd}D</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShowDetails}>
                    <FileText className="mr-2 h-4 w-4" />
                    Show details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setInfoOpen(true)}>
                    <Info className="mr-2 h-4 w-4" />
                    File info dialog
                    <DropdownMenuShortcut>{cmd}I</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShowVersions}>
                    <History className="mr-2 h-4 w-4" />
                    Show versions
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/*
                   * RAG / processed-document actions. Open the Document tab
                   * (4-pane viewer of pages, cleaned text, chunks, lineage)
                   * or kick off `/rag/ingest` to (re-)process. The Document
                   * tab itself lazy-loads its viewer; clicking these from a
                   * never-ingested file flips into the "Process for RAG"
                   * CTA without an extra click.
                   */}
                  <DropdownMenuItem onClick={handleShowDocument}>
                    <FileSearch className="mr-2 h-4 w-4" />
                    Open document view
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleOpenRagViewer()}>
                    <FileSearch className="mr-2 h-4 w-4" />
                    Advanced RAG viewer
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleReprocess}>
                    <RotateCw className="mr-2 h-4 w-4" />
                    Reprocess for RAG
                  </DropdownMenuItem>
                </>
              ) : null}

              {!isVirtual ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Lock className="mr-2 h-4 w-4" />
                    Visibility
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onClick={() => void handleVisibility("private")}
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      Private
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void handleVisibility("shared")}
                    >
                      <Users className="mr-2 h-4 w-4" />
                      Shared
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void handleVisibility("public")}
                    >
                      <Globe className="mr-2 h-4 w-4" />
                      Public
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
                <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the file to trash. You can restore it from versions
              for 30 days before bytes are removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void actions.delete({ hard: false });
                setConfirmOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={batchConfirmOpen} onOpenChange={setBatchConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {batchFileIds.length}{" "}
              {batchFileIds.length === 1 ? "file" : "files"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              These files will move to trash. You can restore them for 30 days
              before bytes are removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleBatchDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FileInfoDialog
        fileId={fileId}
        open={infoOpen}
        onOpenChange={setInfoOpen}
      />

      {file && !onRename ? (
        <RenameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          kind="file"
          resourceId={fileId}
          currentName={file.fileName}
        />
      ) : null}
    </>
  );
}
