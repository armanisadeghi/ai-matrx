/**
 * features/files/hooks/useCloudTree.ts
 *
 * Top-level tree hook — exposes the root spine + tree status. Triggers the
 * initial RPC load if the tree isn't hydrated yet. Most consumers should
 * prefer `useFolderContents(folderId)` for scoped views; this hook is for the
 * sidebar root.
 */

"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllFoldersMap,
  selectAllFilesMap,
  selectRootFileIds,
  selectRootFolderIds,
  selectTreeError,
  selectTreeStatus,
} from "@/features/files/redux/selectors";
import { loadUserFileTree } from "@/features/files/redux/thunks";
import type { CloudFileRecord, CloudFolderRecord } from "@/features/files/types";

export interface UseCloudTreeResult {
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
  rootFolders: CloudFolderRecord[];
  rootFiles: CloudFileRecord[];
  /**
   * Re-fetch the user's cloud-files tree from the API. The realtime
   * channel normally keeps the tree live; this is an explicit-refresh
   * escape hatch for UI surfaces (e.g. the explorer refresh button).
   * No-op when `userId` is null.
   */
  refresh: () => void;
}

/**
 * Pass the current user id; pass null to suppress the fetch (e.g. unauth).
 * The provider at [providers/CloudFilesRealtimeProvider.tsx](../providers/CloudFilesRealtimeProvider.tsx)
 * also fires the fetch — this hook is safe to use in parallel (it short-circuits
 * once the tree is `loaded`).
 */
export function useCloudTree(userId: string | null): UseCloudTreeResult {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectTreeStatus);
  const error = useAppSelector(selectTreeError);

  useEffect(() => {
    if (!userId) return;
    if (status === "idle" || status === "error") {
      void dispatch(loadUserFileTree({ userId }));
    }
  }, [dispatch, userId, status]);

  const rootFolderIds = useAppSelector(selectRootFolderIds);
  const rootFileIds = useAppSelector(selectRootFileIds);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const filesById = useAppSelector(selectAllFilesMap);

  const rootFolders = rootFolderIds
    .map((id) => foldersById[id])
    .filter(Boolean) as CloudFolderRecord[];
  const rootFiles = rootFileIds
    .map((id) => filesById[id])
    .filter(Boolean) as CloudFileRecord[];

  const refresh = useCallback(() => {
    if (!userId) return;
    void dispatch(loadUserFileTree({ userId }));
  }, [dispatch, userId]);

  return { status, error, rootFolders, rootFiles, refresh };
}
