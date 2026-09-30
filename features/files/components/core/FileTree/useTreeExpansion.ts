/**
 * features/files/components/core/FileTree/useTreeExpansion.ts
 *
 * Local UI state for expanded folder ids + a flat visible-row list derived
 * from the Redux tree. Kept in local state (not Redux) because it's a purely
 * per-surface concern — the WindowPanel, sidebar, and mobile push view all
 * have independent expansion states.
 */

"use client";

import { useShowSystemFiles } from "@/features/files/hooks/useShowSystemFiles";
import {
  isListedFile,
  isListedFolderPath,
} from "@/features/files/utils/user-visible";
import { useCallback, useMemo, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllFilesMap,
  selectAllFoldersMap,
  selectChildrenByFolderId,
  selectRootFileIds,
  selectRootFolderIds,
  selectSort,
} from "@/features/files/redux/selectors";
import { sortChildren } from "@/features/files/redux/tree-utils";
import type {
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files/types";

export interface TreeRow {
  kind: "file" | "folder";
  id: string;
  depth: number;
  parentId: string | null;
  /** For folders only. */
  expanded?: boolean;
  /** For folders only — true if the folder's children list is empty. */
  empty?: boolean;
  record: CloudFileRecord | CloudFolderRecord;
}

export interface UseTreeExpansionOptions {
  initialExpanded?: string[];
}

export interface UseTreeExpansionResult {
  rows: TreeRow[];
  expanded: Set<string>;
  isExpanded: (folderId: string) => boolean;
  toggle: (folderId: string) => void;
  expand: (folderId: string) => void;
  collapse: (folderId: string) => void;
  expandAllTo: (folderId: string) => void;
  /** Expand every folder in the tree. Useful for "show me everything" UX. */
  expandAll: () => void;
  /** Collapse every folder back to root. */
  collapseAll: () => void;
}

export function useTreeExpansion(
  options: UseTreeExpansionOptions = {},
): UseTreeExpansionResult {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(options.initialExpanded ?? []),
  );

  const rootFolderIds = useAppSelector(selectRootFolderIds);
  const rootFileIds = useAppSelector(selectRootFileIds);
  const childrenByFolderId = useAppSelector(selectChildrenByFolderId);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const filesById = useAppSelector(selectAllFilesMap);
  const sort = useAppSelector(selectSort);
  // System files list only while files.show_system_files is on (user-visible.ts).
  const { showSystemFiles } = useShowSystemFiles();

  const isExpanded = useCallback(
    (folderId: string) => expanded.has(folderId),
    [expanded],
  );

  const toggle = useCallback((folderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const expand = useCallback((folderId: string) => {
    setExpanded((prev) => {
      if (prev.has(folderId)) return prev;
      const next = new Set(prev);
      next.add(folderId);
      return next;
    });
  }, []);

  const collapse = useCallback((folderId: string) => {
    setExpanded((prev) => {
      if (!prev.has(folderId)) return prev;
      const next = new Set(prev);
      next.delete(folderId);
      return next;
    });
  }, []);

  const expandAllTo = useCallback(
    (folderId: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        let current: string | null = folderId;
        const seen = new Set<string>();
        while (current && !seen.has(current)) {
          seen.add(current);
          next.add(current);
          current = foldersById[current]?.parentId ?? null;
        }
        return next;
      });
    },
    [foldersById],
  );

  const expandAll = useCallback(() => {
    // Expand every folder we know about. Cheaper than walking the visible
    // rows because we have the full map already.
    setExpanded(new Set(Object.keys(foldersById)));
  }, [foldersById]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  // Derive the flat visible-row list.
  const rows = useMemo<TreeRow[]>(() => {
    const result: TreeRow[] = [];

    function pushFolder(
      folder: CloudFolderRecord,
      depth: number,
    ): void {
      const open = expanded.has(folder.id);
      const children = childrenByFolderId[folder.id] ?? {
        folderIds: [],
        fileIds: [],
      };
      result.push({
        kind: "folder",
        id: folder.id,
        depth,
        parentId: folder.parentId,
        expanded: open,
        empty:
          children.folderIds.length === 0 && children.fileIds.length === 0,
        record: folder,
      });
      if (!open) return;
      const sorted = sortChildren(
        children,
        filesById,
        foldersById,
        sort.sortBy,
        sort.sortDir,
      );
      for (const id of sorted.folderIds) {
        const child = foldersById[id];
        if (
          child &&
          !child.deletedAt &&
          isListedFolderPath(child.folderPath, showSystemFiles)
        )
          pushFolder(child, depth + 1);
      }
      for (const id of sorted.fileIds) {
        const child = filesById[id];
        if (!child || child.deletedAt) continue;
        if (!isListedFile(child, showSystemFiles)) continue;
        result.push({
          kind: "file",
          id: child.id,
          depth: depth + 1,
          parentId: folder.id,
          record: child,
        });
      }
    }

    const rootSorted = sortChildren(
      { folderIds: rootFolderIds, fileIds: rootFileIds },
      filesById,
      foldersById,
      sort.sortBy,
      sort.sortDir,
    );
    for (const id of rootSorted.folderIds) {
      const folder = foldersById[id];
      if (
        folder &&
        !folder.deletedAt &&
        isListedFolderPath(folder.folderPath, showSystemFiles)
      )
        pushFolder(folder, 0);
    }
    for (const id of rootSorted.fileIds) {
      const file = filesById[id];
      if (!file || file.deletedAt) continue;
      if (!isListedFile(file, showSystemFiles)) continue;
      result.push({
        kind: "file",
        id: file.id,
        depth: 0,
        parentId: null,
        record: file,
      });
    }

    return result;
  }, [
    expanded,
    rootFolderIds,
    rootFileIds,
    childrenByFolderId,
    foldersById,
    filesById,
    sort.sortBy,
    sort.sortDir,
    showSystemFiles,
  ]);

  return {
    rows,
    expanded,
    isExpanded,
    toggle,
    expand,
    collapse,
    expandAllTo,
    expandAll,
    collapseAll,
  };
}
