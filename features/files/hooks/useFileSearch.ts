/**
 * features/files/hooks/useFileSearch.ts
 *
 * Client-side search over the already-loaded tree. Returns debounced
 * matches across files and folders.
 *
 * This is intentionally client-side: the tree is normalized in Redux and
 * searching through 10k records is < 1ms. For heavier queries (full-text
 * content, cross-tenant search) a server-side RPC would be added separately.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllFilesMap,
  selectAllFoldersMap,
} from "@/features/files/redux/selectors";
import {
  searchFiles as searchFilesUtil,
  searchFolders as searchFoldersUtil,
} from "@/features/files/redux/tree-utils";
import type { CloudFileRecord, CloudFolderRecord } from "@/features/files/types";

export interface UseFileSearchOptions {
  /** Debounce in ms. Default 120. */
  debounceMs?: number;
  /** Max results per bucket. Default 25. */
  limit?: number;
}

export interface UseFileSearchResult {
  query: string;
  setQuery: (q: string) => void;
  /** Results reflect the debounced query, not the raw query. */
  files: CloudFileRecord[];
  folders: CloudFolderRecord[];
  totalResults: number;
  /** True while waiting out the debounce after a keystroke. */
  isPending: boolean;
  clear: () => void;
}

export function useFileSearch(
  options: UseFileSearchOptions = {},
): UseFileSearchResult {
  const { debounceMs = 120, limit = 25 } = options;
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  const filesById = useAppSelector(selectAllFilesMap);
  const foldersById = useAppSelector(selectAllFoldersMap);

  useEffect(() => {
    if (query === debounced) return undefined;
    const t = setTimeout(() => setDebounced(query), debounceMs);
    return () => clearTimeout(t);
  }, [query, debounced, debounceMs]);

  const results = useMemo(() => {
    if (!debounced.trim()) {
      return { files: [] as CloudFileRecord[], folders: [] as CloudFolderRecord[] };
    }
    const files = searchFilesUtil(filesById, debounced).slice(0, limit);
    const folders = searchFoldersUtil(foldersById, debounced).slice(0, limit);
    return { files, folders };
  }, [debounced, filesById, foldersById, limit]);

  return {
    query,
    setQuery,
    files: results.files,
    folders: results.folders,
    totalResults: results.files.length + results.folders.length,
    isPending: query !== debounced,
    clear: () => {
      setQuery("");
      setDebounced("");
    },
  };
}
