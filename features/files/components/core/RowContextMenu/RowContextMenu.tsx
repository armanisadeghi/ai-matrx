/**
 * features/files/components/core/RowContextMenu/RowContextMenu.tsx
 *
 * Right-click menus for file and folder rows — consolidated onto the ONE
 * universal context menu (v3). The file-manager actions (preview, download,
 * cut/copy/paste of the file object, rename, move, duplicate, PDF surfaces,
 * RAG, delete) ride in as `extraSections`; everything else (Copy text, AI
 * actions, surface-bound + default agents, Attach To / Share for files,
 * Quick Actions, admin tools) is the standard menu. The "..." dropdown menu
 * remains the full-parity action list; this stays the fast subset.
 *
 * Consumer contract is unchanged: same exports, same props. Delete confirms
 * through the global ConfirmDialog (no local AlertDialog). Folder share keeps
 * the ShareLinkDialog (folders are not a ctx entity type; files get the v3
 * entity wire instead).
 */

"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PDF_SURFACES } from "@/features/pdf/surfaces/registry";
import { resolvePdfSurfaceIds } from "@/features/pdf/hooks/usePdfSurfaceLinks";
import {
  ArchiveRestore,
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
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/components/ui/use-toast";
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
  purgeFile as purgeFileThunk,
  purgeFolder as purgeFolderThunk,
  restoreFile as restoreFileThunk,
  restoreFolder as restoreFolderThunk,
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

const FILES_SURFACE = "matrx-user/files";

const cmdKey = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.platform)
    ? "⌘"
    : "Ctrl";

// ---------------------------------------------------------------------------
// File row context menu
// ---------------------------------------------------------------------------

export interface FileRowContextMenuProps {
  fileId: string;
  children: React.ReactNode;
}

export function FileRowContextMenu({
  fileId,
  children,
}: FileRowContextMenuProps) {
  const dispatch = useAppDispatch();
  const filesById = useAppSelector(selectAllFilesMap);
  const file = filesById[fileId];
  const actions = useFileActions(fileId);
  const router = useRouter();

  const cmd = cmdKey();

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
      // useFileActions.move is source-aware: real → moveFileThunk,
      // virtual → moveAny.
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

  const handleDelete = useCallback(async () => {
    if (!file) return;
    const ok = await confirm({
      title: "Delete file?",
      description: `This moves "${file.fileName}" to trash. You can restore it from versions for 30 days before bytes are removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (ok) void actions.delete({ hard: false });
  }, [actions, file]);

  if (!file) {
    return <>{children}</>;
  }

  // Trash mode (Wave A lifecycle): a trashed row offers exactly two actions —
  // Restore, or the ONLY hard-delete path in the system (purge from trash).
  if (file.deletedAt) {
    const trashItems: ContextMenuExtraItem[] = [
      {
        kind: "item",
        id: "file-restore",
        label: "Restore",
        icon: ArchiveRestore,
        onSelect: () => void dispatch(restoreFileThunk({ fileId })),
      },
      {
        kind: "item",
        id: "file-purge",
        label: "Delete forever",
        icon: Trash2,
        destructive: true,
        onSelect: () =>
          void (async () => {
            const ok = await confirm({
              title: "Permanently delete file?",
              description: `"${file.fileName}" and all of its extracted data (pages, segments, embeddings) will be gone forever. This cannot be undone.`,
              confirmLabel: "Delete forever",
              variant: "destructive",
            });
            if (ok) void dispatch(purgeFileThunk({ fileId }));
          })(),
      },
    ];
    return (
      <NonEditableContextMenu
        sourceFeature="files"
        surfaceName={FILES_SURFACE}
        contextData={{
          content: file.fileName,
          active_file_id: fileId,
          active_file_name: file.fileName,
          active_file_mime_type: file.mimeType ?? "",
        }}
        entity={{
          type: "file",
          id: fileId,
          title: file.fileName,
          resourceType: "file",
        }}
        extraSections={[
          { id: "file-trash-actions", anchor: "after-clipboard", items: trashItems },
        ]}
        enableFloatingIcon={false}
      >
        {children}
      </NonEditableContextMenu>
    );
  }

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "file-preview",
      label: "Preview",
      icon: Eye,
      onSelect: handlePreview,
    },
  ];

  // Download / Copy link / Duplicate go through the Python signed-URL
  // endpoint — only meaningful for real cloud-files. Virtual rows hide these
  // (their inline preview owns export/share semantics).
  if (!isVirtual) {
    items.push(
      {
        kind: "item",
        id: "file-download",
        label: "Download",
        icon: Download,
        onSelect: () => void actions.download(),
      },
      {
        kind: "item",
        id: "file-copy-link",
        label: "Copy link",
        icon: Copy,
        hint: `${cmd}L`,
        onSelect: () => void actions.copyShareUrl(),
      },
    );
  }

  items.push({
    kind: "item",
    id: "file-cut",
    label: "Cut file",
    icon: Scissors,
    hint: `${cmd}X`,
    onSelect: () =>
      setClipboard({
        op: "cut",
        items: [
          { id: fileId, kind: "file", source: isVirtual ? "virtual" : "real" },
        ],
        setAt: Date.now(),
      }),
  });
  if (!isVirtual) {
    items.push({
      kind: "item",
      id: "file-copy",
      label: "Copy file",
      icon: Copy,
      hint: `${cmd}C`,
      onSelect: () =>
        setClipboard({
          op: "copy",
          items: [{ id: fileId, kind: "file", source: "real" }],
          setAt: Date.now(),
        }),
    });
  }

  items.push(
    {
      kind: "item",
      id: "file-rename",
      label: "Rename",
      icon: Edit2,
      hint: "F2",
      onSelect: () => requestRename("file", fileId),
    },
    {
      kind: "item",
      id: "file-move",
      label: "Move…",
      icon: FolderInput,
      onSelect: () => void handleMove(),
    },
  );
  if (!isVirtual) {
    items.push({
      kind: "item",
      id: "file-duplicate",
      label: "Duplicate",
      icon: CopyPlus,
      hint: `${cmd}D`,
      onSelect: () => void handleDuplicate(),
    });
  }

  // PDF surfaces — canonical registry; identical list everywhere.
  if (!isVirtual && file?.mimeType === "application/pdf") {
    items.push({
      kind: "submenu",
      id: "file-pdf-surfaces",
      label: "Open in…",
      icon: FileSearch,
      children: PDF_SURFACES.filter((sf) => sf.id !== "rag-library").map(
        (surface) => ({
          kind: "item" as const,
          id: `pdf-${surface.id}`,
          label: surface.label,
          icon: surface.icon,
          onSelect: () => {
            void resolvePdfSurfaceIds({ fileId }).then((ids) => {
              const href = surface.buildHref(ids);
              if (href) router.push(href);
            });
          },
        }),
      ),
    });
  }

  if (!isVirtual) {
    items.push(
      {
        kind: "item",
        id: "file-document-view",
        label: "Open document view",
        icon: FileSearch,
        onSelect: openDocumentTab,
      },
      {
        kind: "item",
        id: "file-reprocess",
        label: "Reprocess for RAG",
        icon: Stars,
        onSelect: handleReprocess,
      },
    );
  }

  items.push({
    kind: "item",
    id: "file-delete",
    label: "Delete",
    icon: Trash2,
    destructive: true,
    hint: "⌫",
    onSelect: () => void handleDelete(),
  });

  const extraSections: ContextMenuExtraSection[] = [
    { id: "file-actions", anchor: "after-clipboard", items },
  ];

  return (
    <NonEditableContextMenu
      sourceFeature="files"
      surfaceName={FILES_SURFACE}
      contextData={{
        content: file.fileName,
        active_file_id: fileId,
        active_file_name: file.fileName,
        active_file_mime_type: file.mimeType ?? "",
      }}
      entity={{
        type: "file",
        id: fileId,
        title: file.fileName,
        resourceType: "file",
      }}
      extraSections={extraSections}
      enableFloatingIcon={false}
    >
      {children}
    </NonEditableContextMenu>
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
  const [shareOpen, setShareOpen] = useState(false);

  const isVirtual = folder?.source.kind === "virtual";
  const hasClipboard = !!clipboard && clipboard.items.length > 0;

  const handlePaste = useCallback(async () => {
    if (!clipboard || clipboard.items.length === 0) return;
    // Only the cut → move case is wired at the row level. For copy →
    // duplicate (which needs to fetch bytes + re-upload), users should use
    // the Cmd/Ctrl+V keyboard shortcut on the active folder, where the full
    // duplicate pipeline lives.
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
              moveFileThunk({ fileId: item.id, newParentFolderId: folderId }),
            ).unwrap();
          }
        } else {
          // Folder cycle guard — refuse to drop a folder into itself or any
          // of its descendants.
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

  const cmd = cmdKey();

  const handleOpen = useCallback(() => {
    if (onOpen) {
      onOpen();
      return;
    }
    dispatch(setActiveFolderId(folderId));
  }, [dispatch, folderId, onOpen]);

  const handleDelete = useCallback(async () => {
    if (!folder) return;
    const ok = await confirm({
      title: "Delete folder?",
      description: `Move "${folder.folderName}" and all of its contents to Trash. You can restore it later.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await folderActions.delete();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: extractErrorMessage(err),
        variant: "destructive",
      });
    }
  }, [folder, folderActions]);

  const handleMove = useCallback(async () => {
    if (!folder) return;
    const newParent = await openFolderPicker({ title: "Move folder to…" });
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

  // Trash mode (Wave A lifecycle) — mirror of the file trash menu.
  if (folder.deletedAt) {
    const trashItems: ContextMenuExtraItem[] = [
      {
        kind: "item",
        id: "folder-restore",
        label: "Restore",
        icon: ArchiveRestore,
        onSelect: () => void dispatch(restoreFolderThunk({ folderId })),
      },
      {
        kind: "item",
        id: "folder-purge",
        label: "Delete forever",
        icon: Trash2,
        destructive: true,
        onSelect: () =>
          void (async () => {
            const ok = await confirm({
              title: "Permanently delete folder?",
              description: `"${folder.folderName}" and everything inside it will be gone forever. This cannot be undone.`,
              confirmLabel: "Delete forever",
              variant: "destructive",
            });
            if (ok) void dispatch(purgeFolderThunk({ folderId }));
          })(),
      },
    ];
    return (
      <NonEditableContextMenu
        sourceFeature="files"
        surfaceName={FILES_SURFACE}
        contextData={{
          content: folder.folderName,
          active_folder_id: folderId,
        }}
        extraSections={[
          {
            id: "folder-trash-actions",
            anchor: "after-clipboard",
            items: trashItems,
          },
        ]}
        enableFloatingIcon={false}
      >
        {children}
      </NonEditableContextMenu>
    );
  }

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "folder-open",
      label: "Open",
      icon: FolderOpen,
      onSelect: handleOpen,
    },
  ];

  if (!isVirtual) {
    items.push(
      {
        kind: "item",
        id: "folder-copy-link",
        label: "Copy link",
        icon: Copy,
        hint: `${cmd}L`,
        onSelect: () => void folderActions.copyShareUrl(),
      },
      {
        kind: "item",
        id: "folder-share",
        label: "Share…",
        icon: Share2,
        onSelect: () => setShareOpen(true),
      },
    );
  }

  items.push({
    kind: "item",
    id: "folder-cut",
    label: "Cut folder",
    icon: Scissors,
    hint: `${cmd}X`,
    onSelect: () =>
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
      }),
  });
  if (!isVirtual) {
    items.push({
      kind: "item",
      id: "folder-copy",
      label: "Copy folder",
      icon: Copy,
      hint: `${cmd}C`,
      onSelect: () =>
        setClipboard({
          op: "copy",
          items: [{ id: folderId, kind: "folder", source: "real" }],
          setAt: Date.now(),
        }),
    });
  }
  if (hasClipboard) {
    items.push({
      kind: "item",
      id: "folder-paste",
      label: `Paste ${clipboard?.op === "cut" ? "into folder" : "(copy)"}`,
      icon: ClipboardPaste,
      hint: `${cmd}V`,
      disabled: clipboard?.op === "copy",
      description:
        clipboard?.op === "copy"
          ? "Use Cmd/Ctrl+V on the active folder to paste a copy"
          : undefined,
      onSelect: () => void handlePaste(),
    });
  }

  items.push(
    {
      kind: "item",
      id: "folder-rename",
      label: "Rename",
      icon: Edit2,
      hint: "F2",
      onSelect: () => requestRename("folder", folderId),
    },
    {
      kind: "item",
      id: "folder-move",
      label: "Move…",
      icon: FolderInput,
      onSelect: () => void handleMove(),
    },
  );
  if (onNewFolderInside) {
    items.push({
      kind: "item",
      id: "folder-new-inside",
      label: "New folder inside",
      icon: FolderPlus,
      onSelect: onNewFolderInside,
    });
  }
  items.push({
    kind: "item",
    id: "folder-delete",
    label: "Delete folder",
    icon: Trash2,
    destructive: true,
    hint: "⌫",
    onSelect: () => void handleDelete(),
  });

  const extraSections: ContextMenuExtraSection[] = [
    { id: "folder-actions", anchor: "after-clipboard", items },
  ];

  return (
    <>
      <NonEditableContextMenu
        sourceFeature="files"
        surfaceName={FILES_SURFACE}
        contextData={{
          content: folder.folderName,
          active_folder_id: folderId,
        }}
        extraSections={extraSections}
        enableFloatingIcon={false}
      >
        {children}
      </NonEditableContextMenu>

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
