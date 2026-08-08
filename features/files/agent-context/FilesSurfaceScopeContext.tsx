/**
 * features/files/agent-context/FilesSurfaceScopeContext.tsx
 *
 * Shares the page-level `matrx-user/files` contextData (built once by
 * `PageShell` via `buildFilesContextData`) with the row-level context menus
 * mounted deep inside the file lists — so a right-click on a row emits every
 * declared surface value, not a minimal id/name subset (the "VALUE MAPPING
 * GAP" scream this file exists to kill).
 *
 * Design:
 *  - The provider stores the latest contextData in a ref and hands consumers
 *    ONE stable getter, so 200 rows never re-render when page state (search,
 *    filters, selection) changes — rows read the scope lazily at click time.
 *  - When a row menu mounts OUTSIDE `PageShell` (files window panel, embedded
 *    shell, PDF studio sidebar), the hook falls back to assembling the full
 *    args straight from the Redux store at call time — same builder, honest
 *    values, no subscriptions.
 */

"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import {
  selectActiveFileId,
  selectActiveFolderId,
  selectAllFilesArray,
  selectAllFilesMap,
  selectAllFoldersArray,
  selectAllFoldersMap,
  selectChipFilter,
  selectColumnFilters,
  selectDetailsLevel,
  selectFocusedId,
  selectKindFilter,
  selectSearchQuery,
  selectSelection,
  selectSortBy,
  selectSortDir,
  selectTreeStatus,
  selectViewMode,
  selectVisibleColumns,
  selectVisibleUploads,
} from "@/features/files/redux/selectors";
import { buildFilesContextData } from "./buildFilesContextData";

type ContextDataGetter = () => Record<string, unknown>;

const FilesSurfaceScopeContext = createContext<ContextDataGetter | null>(null);

export interface FilesSurfaceScopeProviderProps {
  /** The page-level scope, rebuilt by the host on every render. */
  contextData: Record<string, unknown>;
  children: React.ReactNode;
}

/**
 * Mounted by the shell that owns the full browser state (`PageShell`). The
 * context VALUE is a stable getter — consumers never re-render from it.
 */
export function FilesSurfaceScopeProvider({
  contextData,
  children,
}: FilesSurfaceScopeProviderProps) {
  const latestRef = useRef(contextData);
  useEffect(() => {
    latestRef.current = contextData;
  });
  const [getContextData] = useState(
    (): ContextDataGetter => () => latestRef.current,
  );
  return (
    <FilesSurfaceScopeContext.Provider value={getContextData}>
      {children}
    </FilesSurfaceScopeContext.Provider>
  );
}

/** URL path → files section. Mirrors `PRIMARY_SECTIONS` in desktop/section.ts. */
function sectionFromPath(): string {
  if (typeof window === "undefined") return "all";
  const path = window.location.pathname;
  if (!path.startsWith("/files")) return "all";
  const seg = path.split("/")[2] ?? "";
  switch (seg) {
    case "":
      return "all";
    case "recents":
    case "photos":
    case "shared":
    case "requests":
    case "trash":
    case "starred":
    case "activity":
    case "webhooks":
      return seg;
    case "folders":
      return "folders";
    default:
      return "all";
  }
}

/**
 * Fallback for row menus mounted outside `PageShell`: assemble the full
 * builder args from the store at call time. Visible rows approximate to the
 * children of the active folder (root when none) — the closest honest answer
 * a shell without the page's search/scoping logic can give.
 */
function buildFallbackContextData(state: RootState): Record<string, unknown> {
  const section = sectionFromPath();
  const filesById = selectAllFilesMap(state);
  const foldersById = selectAllFoldersMap(state);
  const activeFileId = selectActiveFileId(state);
  const activeFolderId = selectActiveFolderId(state);
  const selection = selectSelection(state);
  const inTrash = section === "trash";
  const allFiles = selectAllFilesArray(state);
  const allFolders = selectAllFoldersArray(state);
  const visibleFiles = allFiles.filter(
    (f) =>
      (inTrash ? f.deletedAt !== null : f.deletedAt === null) &&
      (inTrash || f.parentFolderId === (activeFolderId ?? null)),
  );
  const visibleFolders = allFolders.filter(
    (f) =>
      (inTrash ? f.deletedAt !== null : f.deletedAt === null) &&
      (inTrash || f.parentId === (activeFolderId ?? null)),
  );
  return buildFilesContextData({
    section,
    treeStatus: selectTreeStatus(state),
    activeFile: activeFileId ? (filesById[activeFileId] ?? null) : null,
    activeFolder: activeFolderId ? (foldersById[activeFolderId] ?? null) : null,
    selectedFiles: selection.selectedIds
      .map((id) => filesById[id])
      .filter((f): f is NonNullable<typeof f> => Boolean(f)),
    focusedId: selectFocusedId(state),
    visibleFiles,
    visibleFolders,
    searchQuery: selectSearchQuery(state),
    chipFilter: selectChipFilter(state),
    kindFilter: selectKindFilter(state),
    columnFilters: selectColumnFilters(state),
    sortBy: selectSortBy(state),
    sortDir: selectSortDir(state),
    viewMode: selectViewMode(state),
    detailsLevel: selectDetailsLevel(state),
    visibleColumns: selectVisibleColumns(state),
    uploads: selectVisibleUploads(state),
  });
}

/**
 * Row-menu scope factory. Returns a plain function that merges the live
 * page-level scope (or the Redux fallback) with row-specific overrides —
 * call it at render for `contextData` and inside `getApplicationScope` for
 * click-time freshness.
 */
export function useFilesRowContextData(): (
  overrides: Record<string, unknown>,
) => Record<string, unknown> {
  const getPageContextData = useContext(FilesSurfaceScopeContext);
  const store = useAppStore();
  return (overrides) => {
    const base = getPageContextData
      ? getPageContextData()
      : buildFallbackContextData(store.getState());
    return { ...base, ...overrides };
  };
}
