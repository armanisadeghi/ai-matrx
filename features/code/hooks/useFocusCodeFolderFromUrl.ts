"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { loadCodeFolders } from "@/features/code-files/redux/thunks";
import {
  selectCodeFoldersMap,
  selectCodeFoldersLoaded,
} from "@/features/code-files/redux/selectors";
import type { CodeFolder } from "@/features/code-files/redux/code-files.types";
import { focusLibraryFolder, revealView } from "../redux/codeWorkspaceSlice";

/**
 * Walk a folder's parent chain, oldest ancestor first. Defensive against a
 * cyclic `parent_folder_id` (a bad row must not hang the tab) — the `seen`
 * set bounds the walk at the number of distinct folders.
 */
function ancestorChain(
  folders: Record<string, CodeFolder>,
  folderId: string,
): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([folderId]);
  let parent = folders[folderId]?.parent_folder_id ?? null;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    chain.unshift(parent);
    parent = folders[parent]?.parent_folder_id ?? null;
  }
  return chain;
}

/**
 * Watches the URL for `?folder=<codeFolderId>` and focuses that folder in the
 * Library tree — expands its whole ancestor chain, highlights the row, and
 * scrolls it into view. This is THE deep link for a `code.code_file_folders`
 * record; every Open door for a code folder rides it.
 *
 * Mounted as a zero-render bridge inside `CodeWorkspace` alongside
 * `useOpenCodeFileFromUrl`.
 */
export function useFocusCodeFolderFromUrl(): void {
  const params = useSearchParams();
  const dispatch = useAppDispatch();
  const folders = useAppSelector(selectCodeFoldersMap);
  const foldersLoaded = useAppSelector(selectCodeFoldersLoaded);

  const folderId = params?.get("folder") ?? null;

  // The tree only ever loads folders when the Library view mounts. A deep
  // link can land with the panel on another view, so ask for them here too —
  // the thunk is the same one the tree dispatches, so this is a no-op when
  // they are already in flight or loaded.
  useEffect(() => {
    if (folderId && !foldersLoaded) {
      dispatch(loadCodeFolders());
    }
  }, [folderId, foldersLoaded, dispatch]);

  // Only report "no such folder" once per id — `folders` changes identity on
  // every slice write, and a toast per write would be a stream of duplicates.
  const reportedMissingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!folderId || !foldersLoaded) return;

    if (!folders[folderId]) {
      if (reportedMissingRef.current !== folderId) {
        reportedMissingRef.current = folderId;
        toast.error(
          "That code folder isn't in your library — it may have been deleted, or it belongs to someone who hasn't shared it with you.",
        );
      }
      return;
    }

    reportedMissingRef.current = null;
    dispatch(
      focusLibraryFolder({
        folderId,
        ancestorIds: ancestorChain(folders, folderId),
      }),
    );
    // `revealView`, never `setActiveView` — the latter toggles the panel shut
    // when the view is already active, which is the default on a fresh load.
    dispatch(revealView("library"));
  }, [folderId, foldersLoaded, folders, dispatch]);
}
