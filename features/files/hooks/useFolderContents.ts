/**
 * features/files/hooks/useFolderContents.ts
 *
 * Returns the normalized children of a folder (files + subfolders), sorted
 * per UI settings. Triggers a fetch if the folder hasn't been fully loaded
 * yet, AND when a previously-loaded folder is re-opened after the
 * staleness TTL has elapsed (default 60 s).
 *
 * Why we need a TTL: realtime covers the optimistic case (current tab
 * sees writes immediately), but two situations leak through:
 *   1. The user navigates away from a folder, another user adds a file,
 *      and the realtime channel was paused / disconnected during the gap.
 *   2. The user reopens after a long idle — even with a healthy channel,
 *      they expect a fresh view.
 *
 * The slice's `fullyLoadedFolderIds` map only tracks a boolean. We layer
 * a module-level `lastLoadedAt` map on top so we don't have to change
 * the slice shape (and risk breaking middlewares that depend on it).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTreeReadStatus } from "@/features/files/hooks/useFilesReadStatus";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  EMPTY_TREE_CHILDREN,
  selectAllFilesMap,
  selectAllFoldersMap,
  selectIsFolderFullyLoaded,
  selectSortedChildrenOfFolder,
  selectSortedRootChildren,
} from "@/features/files/redux/selectors";
import { loadFolderContents } from "@/features/files/redux/thunks";
import type {
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files/types";

export interface UseFolderContentsResult {
  files: CloudFileRecord[];
  folders: CloudFolderRecord[];
  loading: boolean;
  /**
   * Where this folder's read stands. "error" and "loading" mean the lists are
   * NOT an answer — a surface must not render its empty state then.
   */
  status: "loading" | "error" | "ready";
  error: string | null;
  retry: () => void;
}

/** ms — folders revalidate on re-mount older than this. */
const STALE_TTL_MS = 60_000;
/**
 * Module-level timestamp registry. Outside Redux to avoid bloating the
 * slice; cleared by re-mounts that successfully refresh.
 */
const lastLoadedAt = new Map<string, number>();
/** A folder whose last read failed, by id — survives remounts (a panel reopening). */
const folderLoadErrors = new Map<string, string>();

/** Test seam — `null` clears all timestamps. */
export function clearFolderLoadTimestamps(folderId?: string | null): void {
  if (folderId) lastLoadedAt.delete(folderId);
  else lastLoadedAt.clear();
}

/**
 * Pass `null` for root (the user's top-level tree).
 */
export function useFolderContents(
  folderId: string | null,
): UseFolderContentsResult {
  const dispatch = useAppDispatch();
  const tree = useTreeReadStatus();
  const [folderError, setFolderError] = useState<string | null>(() =>
    folderId ? folderLoadErrors.get(folderId) ?? null : null,
  );
  const [attempt, setAttempt] = useState(0);

  const fullyLoaded = useAppSelector((s) =>
    folderId ? selectIsFolderFullyLoaded(s, folderId) : true,
  );

  // Track in-flight refresh per mount so a stale-TTL refresh doesn't
  // double-fire when the parent re-renders.
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!folderId) return;
    const now = Date.now();
    const lastAt = lastLoadedAt.get(folderId);
    const stale = lastAt == null || now - lastAt > STALE_TTL_MS;
    // Two cases trigger a fetch:
    //   - First-time load (slice says not fully loaded)
    //   - Stale TTL (we loaded > N seconds ago and the user is back)
    if (!fullyLoaded || stale) {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      Promise.resolve(dispatch(loadFolderContents({ folderId })))
        .then((result: unknown) => {
          const rejected =
            !!result &&
            typeof result === "object" &&
            (result as { meta?: { requestStatus?: string } }).meta?.requestStatus === "rejected";
          if (rejected) {
            const message =
              (result as { error?: { message?: string } }).error?.message ?? "The folder could not be read.";
            folderLoadErrors.set(folderId, message);
            setFolderError(message);
            return;
          }
          folderLoadErrors.delete(folderId);
          setFolderError(null);
          lastLoadedAt.set(folderId, Date.now());
        })
        .finally(() => {
          refreshingRef.current = false;
        });
    }
  }, [dispatch, folderId, fullyLoaded, attempt]);

  // Fetch sorted children; when folderId is null, use root.
  const rootSorted = useAppSelector(selectSortedRootChildren);
  const folderSorted = useAppSelector((s) =>
    folderId ? selectSortedChildrenOfFolder(s, folderId) : EMPTY_TREE_CHILDREN,
  );
  const children = folderId ? folderSorted : rootSorted;

  const filesById = useAppSelector(selectAllFilesMap);
  const foldersById = useAppSelector(selectAllFoldersMap);

  const files = children.fileIds
    .map((id) => filesById[id])
    .filter(Boolean) as CloudFileRecord[];
  const folders = children.folderIds
    .map((id) => foldersById[id])
    .filter(Boolean) as CloudFolderRecord[];

  const retry = useCallback(() => {
    if (!folderId) return tree.retry();
    folderLoadErrors.delete(folderId);
    lastLoadedAt.delete(folderId);
    setFolderError(null);
    setAttempt((n) => n + 1);
  }, [folderId, tree]);

  // Root reads come from the tree; a folder's own read can fail on its own.
  const status: UseFolderContentsResult["status"] = folderId
    ? folderError
      ? "error"
      : fullyLoaded
        ? "ready"
        : "loading"
    : tree.status;
  const error = folderId ? folderError : tree.error;

  return { files, folders, loading: !fullyLoaded, status, error, retry };
}
