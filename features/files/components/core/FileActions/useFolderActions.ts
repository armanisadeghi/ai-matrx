/**
 * features/files/components/core/FileActions/useFolderActions.ts
 *
 * Headless action bundle for folders — the folder counterpart to
 * `useFileActions`. Buttons, menus, shortcuts call into this rather than
 * touching thunks directly so every surface (dropdown menu, right-click
 * menu, hover toolbar, bulk bar, keyboard) gets the same wiring.
 *
 * Source-aware: virtual folders (Notes / Code Snippets adapter roots and
 * subfolders) route through the source-aware `*Any` thunks so adapter
 * `move`, `rename`, `delete` run against the right Postgres column.
 *
 * Public URL semantics are different from files: a folder share link
 * resolves to the canonical `/s/<token>` share page, not to a
 * direct-bytes endpoint, because a folder isn't a single file. The
 * `copyShareUrl` function below returns the page URL.
 */

"use client";

import { useCallback, useMemo } from "react";
import {
  useAppDispatch,
  useAppSelector,
  useAppStore,
} from "@/lib/redux/hooks";
import {
  createShareLink,
  deleteFolder as deleteFolderThunk,
  loadShareLinks,
  updateFolder as updateFolderThunk,
} from "@/features/files/redux/thunks";
import {
  deleteAny,
  moveAny,
  renameAny,
} from "@/features/files/redux/virtual-thunks";
import {
  selectActiveShareLinksForResource,
  selectFolderById,
} from "@/features/files/redux/selectors";
import { isSyntheticId } from "@/features/files/virtual-sources/path";
import type { Visibility } from "@/features/files/types";

export interface FolderActionHandlers {
  rename: (newName: string) => Promise<void>;
  move: (newParentId: string | null) => Promise<void>;
  setVisibility: (visibility: Visibility) => Promise<void>;
  /** Soft delete by default. Pass `{ hard: true }` for permanent delete. */
  delete: (opts?: { hard?: boolean }) => Promise<void>;
  /**
   * Copies a public URL pointing at the folder's share page. If no active
   * read-only share link exists for this folder, a fresh one is created
   * on demand. The user can revoke it from the Share dialog.
   *
   * Returns the URL that was copied, or `null` for virtual folders (which
   * don't have share-link semantics yet).
   */
  copyShareUrl: () => Promise<string | null>;
}

export function useFolderActions(folderId: string): FolderActionHandlers {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const folder = useAppSelector((s) => selectFolderById(s, folderId));
  // Synthetic ids (`vfs:<adapter>:<vid>`) belong to virtual sources. Route
  // ops through the source-aware `*Any` thunks so each adapter's
  // `rename` / `move` / `delete` runs against the right Postgres column.
  const isVirtual =
    isSyntheticId(folderId) || folder?.source.kind === "virtual";

  const rename = useCallback(
    async (newName: string) => {
      if (isVirtual) {
        await dispatch(renameAny({ id: folderId, newName })).unwrap();
        return;
      }
      await dispatch(
        updateFolderThunk({ folderId, patch: { folderName: newName } }),
      ).unwrap();
    },
    [dispatch, folderId, isVirtual],
  );

  const move = useCallback(
    async (newParentId: string | null) => {
      if (isVirtual) {
        await dispatch(moveAny({ id: folderId, newParentId })).unwrap();
        return;
      }
      await dispatch(
        updateFolderThunk({ folderId, patch: { parentId: newParentId } }),
      ).unwrap();
    },
    [dispatch, folderId, isVirtual],
  );

  const setVisibility = useCallback(
    async (visibility: Visibility) => {
      if (isVirtual) {
        // Virtual sources track visibility per-adapter (or not at all).
        // Until each adapter declares the capability, this is a no-op.
        return;
      }
      await dispatch(
        updateFolderThunk({ folderId, patch: { visibility } }),
      ).unwrap();
    },
    [dispatch, folderId, isVirtual],
  );

  const deleteAction = useCallback(
    async (opts?: { hard?: boolean }) => {
      if (isVirtual) {
        await dispatch(
          deleteAny({ id: folderId, hard: opts?.hard ?? false }),
        ).unwrap();
        return;
      }
      await dispatch(
        deleteFolderThunk({ folderId, hardDelete: opts?.hard ?? false }),
      ).unwrap();
    },
    [dispatch, folderId, isVirtual],
  );

  const copyShareUrl = useCallback(async () => {
    if (isVirtual) return null;

    let token: string | undefined;

    // Reuse an existing active read-only link if any.
    const cached = selectActiveShareLinksForResource(
      store.getState(),
      folderId,
    );
    const cachedRead = cached.find((l) => l.permissionLevel === "viewer");
    if (cachedRead) {
      token = cachedRead.shareToken;
    } else {
      // Cache may be cold — refresh once before deciding to mint a new
      // link, so repeated calls don't pile up duplicates.
      await dispatch(loadShareLinks({ resourceId: folderId, resourceType: "folder" }))
        .unwrap()
        .catch(() => undefined);
      const refreshed = selectActiveShareLinksForResource(
        store.getState(),
        folderId,
      );
      const reusable = refreshed.find((l) => l.permissionLevel === "viewer");
      if (reusable) {
        token = reusable.shareToken;
      } else {
        const link = await dispatch(
          createShareLink({
            resourceId: folderId,
            resourceType: "folder",
            permissionLevel: "viewer",
          }),
        ).unwrap();
        token = link.shareToken;
      }
    }

    if (!token) return null;

    // Folder share resolves to the page (the listing UI), not a single
    // file blob — there's no "direct bytes" view for a directory.
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/s/${token}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* ignore clipboard failures (non-secure contexts) */
      }
    }
    return url;
  }, [dispatch, folderId, isVirtual, store]);

  return useMemo(
    () => ({
      rename,
      move,
      setVisibility,
      delete: deleteAction,
      copyShareUrl,
    }),
    [rename, move, setVisibility, deleteAction, copyShareUrl],
  );
}
