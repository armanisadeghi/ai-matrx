"use client";

/**
 * features/files/hooks/useFileMutation.ts
 *
 * Stable, file-id-agnostic mutation surface for files and folders.
 *
 * Why this exists
 * ───────────────
 * The file-action helpers (`useFileActions(fileId)`, `useFolderActions(fid)`)
 * are great for ONE specific row — but tables, grids, and pickers iterate
 * over many ids and can't call a hook per row (rules of hooks). They need
 * one call up-front that hands back a set of stable callbacks taking the
 * id as a per-invocation argument.
 *
 * `useFileMutation()` and `useFolderMutation()` do that. They wrap the
 * underlying slice thunks so consumers never reach for `dispatch(...)` or
 * import from `features/files/redux/*` — which closes the last Tier-4
 * ESLint hole: the cluster of cloud-image / RAG / WhatsApp surfaces that
 * dispatch `deleteFile` / `moveFile` / `updateFileMetadata` / `updateFolder`
 * / `deleteFolder` / `getSignedUrl` from event handlers with dynamic ids.
 *
 * Each method returns the thunk's resolved value (`.unwrap()`) so callers
 * can `await` and `try/catch` per row without threading a redux-thunk
 * error object.
 *
 * Naming
 * ──────
 * - `delete` is a reserved word, so the destructive ops are exposed as
 *   `remove(fileId)` / `removeFolder(folderId)`.
 * - `signedUrl(fileId)` returns `{ url, expiresIn }`; it's named like a
 *   reader because it doesn't mutate state, but it's grouped here because
 *   the consumers that need it (table row actions, "open in new tab") are
 *   the same surfaces that need the other ops.
 */

import { useMemo } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  deleteFile,
  deleteFolder,
  getSignedUrl,
  moveFile,
  renameFile,
  updateFileMetadata,
  updateFolder,
} from "@/features/files/redux/thunks";
import type { Visibility } from "@/features/files/types";

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export interface FileMutations {
  /** Rename a file (display name; the cld_files row's `name` column). */
  rename(fileId: string, newName: string): Promise<void>;
  /** Move a file to a new parent folder (null = drive root). */
  move(fileId: string, newParentFolderId: string | null): Promise<void>;
  /** Update visibility + arbitrary metadata patch. */
  updateMetadata(
    fileId: string,
    patch: { visibility?: Visibility; metadata?: Record<string, unknown> },
  ): Promise<void>;
  /** Convenience over `updateMetadata` for the visibility-only case. */
  setVisibility(fileId: string, visibility: Visibility): Promise<void>;
  /** Soft-delete (trash) by default; pass `hard: true` to bypass trash. */
  remove(fileId: string, options?: { hard?: boolean }): Promise<void>;
  /**
   * Fetch a fresh signed URL. Read-shaped, but lives here because the
   * consumers (table actions, "open in new tab") are the same surfaces
   * that need the mutation ops above. Default TTL 3600s.
   */
  signedUrl(
    fileId: string,
    options?: { expiresIn?: number },
  ): Promise<{ url: string; expiresIn: number }>;
}

/**
 * Returns a stable set of file mutation callbacks. The returned object's
 * identity is stable across renders (no `dispatch` in deps), so consumers
 * can pass it into memoised callbacks or `useEffect` arrays without
 * triggering re-runs.
 */
export function useFileMutation(): FileMutations {
  const dispatch = useAppDispatch();
  return useMemo<FileMutations>(
    () => ({
      rename: (fileId, newName) =>
        dispatch(renameFile({ fileId, newName })).unwrap(),
      move: (fileId, newParentFolderId) =>
        dispatch(moveFile({ fileId, newParentFolderId })).unwrap(),
      updateMetadata: (fileId, patch) =>
        dispatch(updateFileMetadata({ fileId, patch })).unwrap(),
      setVisibility: (fileId, visibility) =>
        dispatch(updateFileMetadata({ fileId, patch: { visibility } })).unwrap(),
      remove: (fileId, options) =>
        dispatch(
          deleteFile({ fileId, hardDelete: options?.hard }),
        ).unwrap(),
      signedUrl: (fileId, options) =>
        dispatch(
          getSignedUrl({ fileId, expiresIn: options?.expiresIn }),
        ).unwrap(),
    }),
    [dispatch],
  );
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export interface FolderMutations {
  /** Rename a folder. */
  rename(folderId: string, folderName: string): Promise<void>;
  /** Re-parent a folder (null = drive root). */
  move(folderId: string, newParentFolderId: string | null): Promise<void>;
  /** Update visibility + arbitrary metadata patch. */
  updateMetadata(
    folderId: string,
    patch: { visibility?: Visibility; metadata?: Record<string, unknown> },
  ): Promise<void>;
  /** Convenience over `updateMetadata` for the visibility-only case. */
  setVisibility(folderId: string, visibility: Visibility): Promise<void>;
  /**
   * Soft-delete by default; pass `hard: true` to bypass trash. Cascades
   * to child files + folders server-side.
   */
  remove(folderId: string, options?: { hard?: boolean }): Promise<void>;
}

/**
 * Returns a stable set of folder mutation callbacks. Same shape as
 * `useFileMutation` — kept distinct so the call sites read clearly
 * ("file mutation" vs "folder mutation") and so future folder-only
 * ops don't pollute the file surface.
 */
export function useFolderMutation(): FolderMutations {
  const dispatch = useAppDispatch();
  return useMemo<FolderMutations>(
    () => ({
      rename: (folderId, folderName) =>
        dispatch(updateFolder({ folderId, patch: { folderName } })).unwrap(),
      move: (folderId, newParentFolderId) =>
        dispatch(
          updateFolder({ folderId, patch: { parentId: newParentFolderId } }),
        ).unwrap(),
      updateMetadata: (folderId, patch) =>
        dispatch(updateFolder({ folderId, patch })).unwrap(),
      setVisibility: (folderId, visibility) =>
        dispatch(updateFolder({ folderId, patch: { visibility } })).unwrap(),
      remove: (folderId, options) =>
        dispatch(
          deleteFolder({ folderId, hardDelete: options?.hard }),
        ).unwrap(),
    }),
    [dispatch],
  );
}
