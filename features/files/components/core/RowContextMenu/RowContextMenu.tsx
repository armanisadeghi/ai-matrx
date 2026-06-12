/**
 * features/files/components/core/RowContextMenu/RowContextMenu.tsx
 *
 * Right-click context menus for file and folder rows. Wraps the row content
 * and renders a Radix ContextMenu — distinct from the dropdown shown by the
 * "..." button so we don't have to control the dropdown's open state.
 *
 * The intent is parity with desktop file managers: right-click anywhere on a
 * row to get the same actions as the More button. We render a focused subset
 * here (the most-used actions) to keep the menu fast and discoverable; the
 * full menu is still available via the "..." button.
 */

"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PDF_SURFACES } from "@/features/pdf/surfaces/registry";
import { resolvePdfSurfaceIds } from "@/features/pdf/hooks/usePdfSurfaceLinks";
import {
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  Edit2,
  Eye,
  FileSearch,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Scissors,
  Share2,
  Stars,
  Trash2,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";
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
import {
  selectAllFilesMap,
  selectFolderById,
} from "@/features/files/redux/selectors";
import {
  setActiveFileId,
  setActiveFolderId,
} from "@/features/files/redux/slice";
import {
  moveFile as moveFileThunk,
  updateFolder as updateFolderThunk,
  uploadFiles as uploadFilesThunk,
} from "@/features/files/redux/thunks";
import { moveAny } from "@/features/files/redux/virtual-thunks";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { useFolderActions } from "@/features/files/components/core/FileActions/useFolderActions";
import { ShareLinkDialog } from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
import { openFilePreview } from "@/features/files/components/preview/openFilePreview";
import { openFolderPicker } from "@/features/files/components/pickers/CloudFilesPickerHost";
import { requestRename } from "@/features/files/components/core/RenameDialog/RenameHost";
import {
  setClipboard,
  useFileClipboard,
} from "@/features/files/utils/clipboard";
import { isSyntheticId } from "@/features/files/virtual-sources/path";
import { extractErrorMessage } from "@/utils/errors";

// ---------------------------------------------------------------------------
// File row context menu
// ---------------------------------------------------------------------------

export interface FileRowContextMenuProps {
  fileId: string;
  children: React.ReactNode;
}

export function FileRowContextMenu({ fileId, children }: FileRowContextMenuProps) {
  const dispatch = useAppDispatch();
  const filesById = useAppSelector(selectAllFilesMap);
  const file = filesById[fileId];
  const actions = useFileActions(fileId);
  const router = useRouter();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const cmd =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform)
      ? "⌘"
      : "Ctrl";

  const handlePreview = useCallback(() => {
    dispatch(setActiveFileId(fileId));
    openFilePreview(fileId);
  }, [dispatch, fileId]);

  // Open the side preview panel and switch to the Document tab. Mirrors
  // `FileContextMenu.handleShowDocument` so the right-click menu and
  // dropdown menu give the same affordance.
  const openDocumentTab = useCallback(() => {
    dispatch(setActiveFileId(fileId));
    openFilePreview(fileId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("cloud-files:open-preview-tab", {
          detail: { fileId, tab: "document" },
        }),
      );
    }
  }, [dispatch, fileId]);

  const handleReprocess = useCallback(() => {
    openDocumentTab();
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("cloud-files:reprocess-document", {
          detail: { fileId, force: true },
        }),
      );
    }
  }, [fileId, openDocumentTab]);

  const isVirtual = file?.source.kind === "virtual";

  const handleMove = useCallback(async () => {
    if (!file) return;
    const folderId = await openFolderPicker({ title: "Move to…" });
    if (folderId === undefined) return; // user dismissed
    if (folderId === file.parentFolderId) return;
    try {
      // useFileActions.move is now source-aware: real → moveFileThunk,
      // virtual → moveAny. Routes correctly without an explicit branch
      // here.
      await actions.move(folderId);
    } catch {
      /* error surfaces via slice state */
    }
  }, [actions, file]);

  const handleDuplicate = useCallback(async () => {
    if (!file) return;
    try {
      // Mirror the keyboard-shortcut duplicate flow — fetch + re-upload to
      // preserve mime type and parent.
      const url = await actions.copyShareUrl({ expiresIn: 600 });
      if (!url) return;
      const blob = await fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      });
      const dot = file.fileName.lastIndexOf(".");
      const newName =
        dot > 0
          ? `${file.fileName.slice(0, dot)} (copy)${file.fileName.slice(dot)}`
          : `${file.fileName} (copy)`;
      const dup = new File([blob], newName, {
        type: file.mimeType ?? blob.type,
      });
      await dispatch(
        uploadFilesThunk({
          files: [dup],
          parentFolderId: file.parentFolderId,
          visibility: file.visibility,
        }),
      ).unwrap();
    } catch {
      /* swallow */
    }
  }, [actions, dispatch, file]);

  if (!file) {
    return <>{children}</>;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={handlePreview}>
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </ContextMenuItem>
          {/* Download / Copy link / Duplicate go through the Python signed-URL
              endpoint — only meaningful for real cloud-files. Virtual rows
              hide these (their inline preview owns export/share semantics). */}
          {!isVirtual ? (
            <>
              <ContextMenuItem onClick={() => void actions.download()}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </ContextMenuItem>
              <ContextMenuItem onClick={() => void actions.copyShareUrl()}>
                <Copy className="mr-2 h-4 w-4" />
                Copy link
                <ContextMenuShortcut>{cmd}L</ContextMenuShortcut>
              </ContextMenuItem>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
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
            <ContextMenuShortcut>{cmd}X</ContextMenuShortcut>
          </ContextMenuItem>
          {!isVirtual ? (
            <ContextMenuItem
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
              <ContextMenuShortcut>{cmd}C</ContextMenuShortcut>
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => requestRename("file", fileId)}>
            <Edit2 className="mr-2 h-4 w-4" />
            Rename
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void handleMove()}>
            <FolderInput className="mr-2 h-4 w-4" />
            Move…
          </ContextMenuItem>
          {!isVirtual ? (
            <ContextMenuItem onClick={() => void handleDuplicate()}>
              <CopyPlus className="mr-2 h-4 w-4" />
              Duplicate
              <ContextMenuShortcut>{cmd}D</ContextMenuShortcut>
            </ContextMenuItem>
          ) : null}
          {/*
           * RAG / processed-document actions. Real files only — virtual
           * sources (notes, code-files) ingest via their own source_kind
           * and surface "Process for RAG" inside their dedicated editors.
           */}
          {/* PDF surfaces — canonical registry; identical list everywhere. */}
          {!isVirtual && file?.mimeType === "application/pdf" ? (
            <>
              <ContextMenuSeparator />
              {PDF_SURFACES.filter((sf) => sf.id !== "rag-library").map(
                (surface) => {
                  const Icon = surface.icon;
                  return (
                    <ContextMenuItem
                      key={surface.id}
                      onClick={() => {
                        void resolvePdfSurfaceIds({ fileId }).then((ids) => {
                          const href = surface.buildHref(ids);
                          if (href) router.push(href);
                        });
                      }}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      Open in {surface.label}
                    </ContextMenuItem>
                  );
                },
              )}
            </>
          ) : null}
          {!isVirtual ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={openDocumentTab}>
                <FileSearch className="mr-2 h-4 w-4" />
                Open document view
              </ContextMenuItem>
              <ContextMenuItem onClick={handleReprocess}>
                <Stars className="mr-2 h-4 w-4" />
                Reprocess for RAG
              </ContextMenuItem>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              This moves <strong>{file.fileName}</strong> to trash. You can
              restore it from versions for 30 days before bytes are removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void actions.delete({ hard: false });
                setConfirmDeleteOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Folder row context menu
// ---------------------------------------------------------------------------

export interface FolderRowContextMenuProps {
  folderId: string;
  children: React.ReactNode;
  onNewFolderInside?: () => void;
  /** Open / activate the folder. Defaults to setting it active in Redux. */
  onOpen?: () => void;
}

export function FolderRowContextMenu({
  folderId,
  children,
  onNewFolderInside,
  onOpen,
}: FolderRowContextMenuProps) {
  const dispatch = useAppDispatch();
  const folder = useAppSelector((s) => selectFolderById(s, folderId));
  const folderActions = useFolderActions(folderId);
  const foldersByIdAll = useAppSelector((s) => s.cloudFiles.foldersById);
  const { clipboard } = useFileClipboard();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isVirtual = folder?.source.kind === "virtual";
  const hasClipboard = !!clipboard && clipboard.items.length > 0;

  const handlePaste = useCallback(async () => {
    if (!clipboard || clipboard.items.length === 0) return;
    // Only the cut → move case is wired at the row level. For copy →
    // duplicate (which needs to fetch bytes + re-upload), users should
    // use the Cmd/Ctrl+V keyboard shortcut on the active folder, where
    // the full duplicate pipeline lives. Surface a hint by leaving the
    // menu item disabled for copy state in the JSX below.
    if (clipboard.op !== "cut") return;
    for (const item of clipboard.items) {
      try {
        if (item.kind === "file") {
          if (item.source === "virtual" || isSyntheticId(item.id)) {
            await dispatch(
              moveAny({ id: item.id, newParentId: folderId }),
            ).unwrap();
          } else {
            await dispatch(
              moveFileThunk({
                fileId: item.id,
                newParentFolderId: folderId,
              }),
            ).unwrap();
          }
        } else {
          // Folder cycle guard — refuse to drop a folder into itself or
          // any of its descendants.
          if (item.id === folderId) continue;
          let cursor: string | null = folderId;
          const seen = new Set<string>();
          let cycle = false;
          while (cursor && !seen.has(cursor)) {
            if (cursor === item.id) {
              cycle = true;
              break;
            }
            seen.add(cursor);
            cursor = foldersByIdAll[cursor]?.parentId ?? null;
          }
          if (cycle) continue;
          if (item.source === "virtual" || isSyntheticId(item.id)) {
            await dispatch(
              moveAny({ id: item.id, newParentId: folderId }),
            ).unwrap();
          } else {
            await dispatch(
              updateFolderThunk({
                folderId: item.id,
                patch: { parentId: folderId },
              }),
            ).unwrap();
          }
        }
      } catch {
        /* per-item failure tolerable */
      }
    }
    setClipboard(null);
  }, [clipboard, dispatch, foldersByIdAll, folderId]);

  const cmd =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform)
      ? "⌘"
      : "Ctrl";

  const handleOpen = useCallback(() => {
    if (onOpen) {
      onOpen();
      return;
    }
    dispatch(setActiveFolderId(folderId));
  }, [dispatch, folderId, onOpen]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await folderActions.delete();
      setConfirmDeleteOpen(false);
    } catch (err) {
      setDeleteError(extractErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }, [folderActions]);

  const handleMove = useCallback(async () => {
    if (!folder) return;
    const newParent = await openFolderPicker({
      title: "Move folder to…",
    });
    if (newParent === undefined) return;
    if (newParent === folder.parentId) return;
    if (newParent === folderId) return; // can't move into itself
    try {
      await folderActions.move(newParent);
    } catch {
      /* slice surfaces error */
    }
  }, [folder, folderActions, folderId]);

  if (!folder) {
    return <>{children}</>;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={handleOpen}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Open
          </ContextMenuItem>
          {!isVirtual ? (
            <>
              <ContextMenuItem
                onClick={() => void folderActions.copyShareUrl()}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy link
                <ContextMenuShortcut>{cmd}L</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => setShareOpen(true)}>
                <Share2 className="mr-2 h-4 w-4" />
                Share…
              </ContextMenuItem>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() =>
              setClipboard({
                op: "cut",
                items: [
                  {
                    id: folderId,
                    kind: "folder",
                    source: isVirtual ? "virtual" : "real",
                  },
                ],
                setAt: Date.now(),
              })
            }
          >
            <Scissors className="mr-2 h-4 w-4" />
            Cut
            <ContextMenuShortcut>{cmd}X</ContextMenuShortcut>
          </ContextMenuItem>
          {!isVirtual ? (
            <ContextMenuItem
              onClick={() =>
                setClipboard({
                  op: "copy",
                  items: [{ id: folderId, kind: "folder", source: "real" }],
                  setAt: Date.now(),
                })
              }
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
              <ContextMenuShortcut>{cmd}C</ContextMenuShortcut>
            </ContextMenuItem>
          ) : null}
          {hasClipboard ? (
            <ContextMenuItem
              onClick={() => void handlePaste()}
              disabled={clipboard?.op === "copy"}
              title={
                clipboard?.op === "copy"
                  ? "Use Cmd/Ctrl+V on the active folder to paste a copy"
                  : undefined
              }
            >
              <ClipboardPaste className="mr-2 h-4 w-4" />
              Paste {clipboard?.op === "cut" ? "into folder" : "(copy)"}
              <ContextMenuShortcut>{cmd}V</ContextMenuShortcut>
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => requestRename("folder", folderId)}>
            <Edit2 className="mr-2 h-4 w-4" />
            Rename
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void handleMove()}>
            <FolderInput className="mr-2 h-4 w-4" />
            Move…
          </ContextMenuItem>
          {onNewFolderInside ? (
            <ContextMenuItem onClick={onNewFolderInside}>
              <FolderPlus className="mr-2 h-4 w-4" />
              New folder inside
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete folder
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog
        open={confirmDeleteOpen}
        onOpenChange={(open) => {
          setConfirmDeleteOpen(open);
          if (!open) setDeleteError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              Move <strong>{folder.folderName}</strong> and all of its contents
              to Trash. You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="text-xs text-destructive">{deleteError}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!isVirtual ? (
        <ShareLinkDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          resourceId={folderId}
          resourceType="folder"
        />
      ) : null}
    </>
  );
}
