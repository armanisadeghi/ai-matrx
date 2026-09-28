/**
 * features/files/components/core/FileContextMenu/useFileMenuActions.ts
 *
 * Single source of truth for the action handlers wired into the file
 * context menus — both the click-trigger DropdownMenu and the
 * right-click ContextMenu use this. Extracting it means we don't
 * accidentally drift between the two menus when we add new actions.
 *
 * Returns stable, ready-to-fire callbacks. The component is responsible
 * only for the visual menu items + which subset of actions to expose.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setActiveFileId } from "@/features/files/redux/slice";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { openFilePreview } from "@/features/files/components/preview/openFilePreview";
import type { Visibility } from "@/features/files/types";

export interface UseFileMenuActionsResult {
  /** Mac → "⌘", Windows / Linux → "Ctrl". For shortcut hint labels. */
  cmd: string;

  // ── Open / preview ──
  /** Open the canonical PreviewPane (cloud-files side panel, OR the
   *  global filePreviewWindow when not on /files). */
  preview: () => void;
  /** Open preview and jump to the Info tab. */
  showDetails: () => void;
  /** Open preview and jump to the Versions tab. */
  showVersions: () => void;

  // ── File actions (all wired through useFileActions thunks) ──
  download: () => Promise<void>;
  copyShareUrl: () => Promise<string | null>;
  setVisibility: (v: Visibility) => Promise<void>;
  deleteFile: () => Promise<void>;

  // ── Confirm-dialog state for delete ──
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  confirmDelete: () => Promise<void>;
}

export function useFileMenuActions(fileId: string): UseFileMenuActionsResult {
  const dispatch = useAppDispatch();
  const actions = useFileActions(fileId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const cmd = useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl";
    return /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘" : "Ctrl";
  }, []);

  const openInPreview = useCallback(
    (tab: "preview" | "info" | "versions") => {
      // Set the active file id (so a mounted PageShell PreviewPane opens
      // to it) AND open the global filePreviewWindow (so chips outside
      // /files get a window). Both are idempotent + cheap, so
      // calling both is the safe default.
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

  const preview = useCallback(() => openInPreview("preview"), [openInPreview]);
  const showDetails = useCallback(() => openInPreview("info"), [openInPreview]);
  const showVersions = useCallback(
    () => openInPreview("versions"),
    [openInPreview],
  );

  const download = useCallback(() => actions.download(), [actions]);
  const copyShareUrl = useCallback(() => actions.copyShareUrl(), [actions]);
  const setVisibility = useCallback(
    (v: Visibility) => actions.setVisibility(v),
    [actions],
  );

  const deleteFile = useCallback(
    () => actions.delete(),
    [actions],
  );

  const confirmDelete = useCallback(async () => {
    setConfirmOpen(false);
    await deleteFile();
  }, [deleteFile]);

  return {
    cmd,
    preview,
    showDetails,
    showVersions,
    download,
    copyShareUrl,
    setVisibility,
    deleteFile,
    confirmOpen,
    setConfirmOpen,
    confirmDelete,
  };
}
