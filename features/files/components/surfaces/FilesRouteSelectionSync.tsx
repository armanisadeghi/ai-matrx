/**
 * features/files/components/surfaces/FilesRouteSelectionSync.tsx
 *
 * Keeps Redux folder/file selection aligned with the URL on every soft
 * navigation — not just the first mount.
 *
 * Split from the old one-shot `useOneShotSelection` hook because that
 * only ran once: back/forward, direct deep-links whose server lookup
 * missed, and client navigations that remounted PageShell could leave
 * `activeFolderId` stale or reset it to null while the pathname still
 * pointed at a nested folder.
 *
 * File selection lives in `?file=<id>` (handled here via `initialFileId`
 * from the server route). Folder selection lives in the pathname under
 * `/files/all/<segments>` — never encode file names into the path.
 *
 * Folder browsing within `/files/all` uses `history.pushState` (see
 * `navigateFilesFolderPath`) so `usePathname()` does not update on every
 * click. A `popstate` listener reads `window.location.pathname` directly
 * for back/forward; Redux is already correct on forward clicks because
 * the handler runs before the URL update.
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectAllFoldersMap,
  selectTreeStatus,
} from "@/features/files/redux/selectors";
import {
  setActiveFileId,
  setActiveFolderId,
} from "@/features/files/redux/slice";
import { loadFolderContents } from "@/features/files/redux/thunks";
import {
  parseFolderPathFromPathname,
  resolveFolderIdByPath,
} from "@/features/files/utils/url-state";

export interface FilesRouteSelectionSyncProps {
  /** Server-resolved folder id (from `cld_folders.folder_path`). */
  initialFolderId?: string | null;
  /** Raw folder path segments joined — client fallback when id lookup misses. */
  initialFolderPath?: string | null;
  /** Server-parsed `?file=` selection. */
  initialFileId?: string | null;
}

export function FilesRouteSelectionSync({
  initialFolderId,
  initialFolderPath,
  initialFileId,
}: FilesRouteSelectionSyncProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const pathname = usePathname();
  const foldersById = useAppSelector(selectAllFoldersMap);
  const treeStatus = useAppSelector(selectTreeStatus);

  const appliedFileRef = useRef<string | null | undefined>(undefined);

  // ?file= — apply whenever the server-parsed id changes (reload / share).
  useEffect(() => {
    if (initialFileId === undefined) return;
    if (appliedFileRef.current === initialFileId) return;
    appliedFileRef.current = initialFileId;
    dispatch(setActiveFileId(initialFileId));
  }, [initialFileId, dispatch]);

  const lastSyncedKeyRef = useRef<string | null>(null);

  const syncFolderFromPathname = useCallback(
    (
      pathToRead: string,
      serverFolderId?: string | null,
      serverFolderPath?: string | null,
    ) => {
      const pathFromUrl = parseFolderPathFromPathname(pathToRead);
      if (pathFromUrl === null) return;

      const folderCount = Object.keys(foldersById).length;
      const syncKey = `${pathToRead}|${serverFolderId ?? ""}|${serverFolderPath ?? ""}|${treeStatus}|${folderCount}`;
      if (lastSyncedKeyRef.current === syncKey) return;

      let targetFolderId: string | null = null;

      if (pathFromUrl === "") {
        targetFolderId = null;
      } else if (serverFolderId) {
        targetFolderId = serverFolderId;
      } else {
        const pathToMatch = serverFolderPath ?? pathFromUrl;
        targetFolderId = resolveFolderIdByPath(pathToMatch, foldersById);
        if (!targetFolderId && treeStatus === "loading") {
          return;
        }
      }

      const currentFolderId = store.getState().cloudFiles.ui.activeFolderId;

      // Deep path we can't resolve yet — keep an in-flight Redux selection
      // if it already matches the URL (e.g. user clicked the folder before
      // the tree finished loading).
      if (targetFolderId === null && pathFromUrl !== "") {
        if (currentFolderId) {
          const currentFolder = foldersById[currentFolderId];
          if (currentFolder?.folderPath === pathFromUrl) {
            targetFolderId = currentFolderId;
          } else {
            return;
          }
        } else {
          return;
        }
      }

      if (targetFolderId !== currentFolderId) {
        dispatch(setActiveFolderId(targetFolderId));
        if (targetFolderId) {
          void dispatch(loadFolderContents({ folderId: targetFolderId }));
        }
      }

      lastSyncedKeyRef.current = syncKey;
    },
    [dispatch, foldersById, store, treeStatus],
  );

  useEffect(() => {
    syncFolderFromPathname(pathname, initialFolderId, initialFolderPath);
  }, [pathname, initialFolderId, initialFolderPath, syncFolderFromPathname]);

  // Back/forward after `history.pushState` folder navigation — Next.js
  // `usePathname()` does not update for those entries.
  useEffect(() => {
    const onPopState = () => {
      syncFolderFromPathname(window.location.pathname);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [syncFolderFromPathname]);

  return null;
}
