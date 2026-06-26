/**
 * features/files/redux/selectors.ts
 *
 * Memoized selectors over the cloudFiles slice. Follow the agent-shortcuts
 * pattern: every read path is wrapped in createSelector; imperative accessors
 * (for middleware / thunks) are named `get...FromState`.
 */

"use client";

import { createSelector } from "reselect";
import {
  EMPTY_TREE_CHILDREN,
  sortChildren as sortChildrenUtil,
} from "./tree-utils";
import type { CloudFilesState } from "@/features/files/types";

// Minimal local state shape — avoids importing from store.ts (which imports
// this module), which would create a type-level circular dependency.
type StateWithCloudFiles = { cloudFiles: CloudFilesState };
import type {
  CloudFile,
  CloudFileRecord,
  CloudFilePermission,
  CloudFileVersion,
  CloudFolder,
  CloudFolderRecord,
  CloudShareLink,
  PermissionLevel,
  RagStatus,
  TreeChildren,
  UploadState,
} from "@/features/files/types";

/** Stable empties — never use `?? []` in selector outputs (new ref every run → Reselect stability warnings). */
export const EMPTY_CLOUD_FILE_PERMISSIONS: CloudFilePermission[] = [];
export const EMPTY_CLOUD_SHARE_LINKS: CloudShareLink[] = [];
const EMPTY_CLOUD_FILE_VERSIONS: CloudFileVersion[] = [];
const EMPTY_PENDING_REQUEST_IDS: string[] = [];

/** Re-export for consumers that import cloud-files selectors from one module. */
export { EMPTY_TREE_CHILDREN };

// ---------------------------------------------------------------------------
// Slice root
// ---------------------------------------------------------------------------

const selectSlice = (state: StateWithCloudFiles) => state.cloudFiles;

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const selectAllFilesMap = createSelector(
  [selectSlice],
  (slice) => slice.filesById,
);

export const selectAllFilesArray = createSelector(
  [selectAllFilesMap],
  (map): CloudFileRecord[] => Object.values(map),
);

export const selectFileById = createSelector(
  [selectAllFilesMap, (_state: StateWithCloudFiles, id: string) => id],
  (map, id): CloudFileRecord | undefined => map[id],
);

/** Imperative — middleware / thunks. */
export function getFileFromState(
  state: StateWithCloudFiles,
  id: string,
): CloudFileRecord | undefined {
  return state.cloudFiles.filesById[id];
}

export const selectFileName = createSelector(
  [selectFileById],
  (record): string | null => record?.fileName ?? null,
);

export const selectFilePath = createSelector(
  [selectFileById],
  (record): string | null => record?.filePath ?? null,
);

export const selectFileVisibility = createSelector(
  [selectFileById],
  (record) => record?.visibility ?? "private",
);

export const selectFileIsDirty = createSelector(
  [selectFileById],
  (record): boolean => record?._dirty ?? false,
);

export const selectFileIsLoading = createSelector(
  [selectFileById],
  (record): boolean => record?._loading ?? false,
);

export const selectFileError = createSelector(
  [selectFileById],
  (record): string | null => record?._error ?? null,
);

export const selectFilePendingRequestIds = createSelector(
  [selectFileById],
  (record): string[] => record?._pendingRequestIds ?? EMPTY_PENDING_REQUEST_IDS,
);

/** Strip runtime fields — for components that only render domain fields. */
export const selectFileDefinition = createSelector(
  [selectFileById],
  (record): CloudFile | undefined => {
    if (!record) return undefined;
    const {
      _dirty: _a,
      _dirtyFields: _b,
      _fieldHistory: _c,
      _loadedFields: _d,
      _loading: _e,
      _error: _f,
      _pendingRequestIds: _g,
      ...definition
    } = record;
    return definition;
  },
);

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export const selectAllFoldersMap = createSelector(
  [selectSlice],
  (slice) => slice.foldersById,
);

export const selectAllFoldersArray = createSelector(
  [selectAllFoldersMap],
  (map): CloudFolderRecord[] => Object.values(map),
);

export const selectFolderById = createSelector(
  [selectAllFoldersMap, (_state: StateWithCloudFiles, id: string) => id],
  (map, id): CloudFolderRecord | undefined => map[id],
);

export function getFolderFromState(
  state: StateWithCloudFiles,
  id: string,
): CloudFolderRecord | undefined {
  return state.cloudFiles.foldersById[id];
}

export const selectFolderDefinition = createSelector(
  [selectFolderById],
  (record): CloudFolder | undefined => {
    if (!record) return undefined;
    const {
      _dirty: _a,
      _dirtyFields: _b,
      _fieldHistory: _c,
      _loadedFields: _d,
      _loading: _e,
      _error: _f,
      _pendingRequestIds: _g,
      ...definition
    } = record;
    return definition;
  },
);

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

const selectTreeSlice = createSelector([selectSlice], (slice) => slice.tree);

export const selectTreeStatus = createSelector(
  [selectTreeSlice],
  (tree) => tree.status,
);

export const selectTreeError = createSelector(
  [selectTreeSlice],
  (tree) => tree.error,
);

export const selectRootFolderIds = createSelector(
  [selectTreeSlice],
  (tree) => tree.rootFolderIds,
);

export const selectRootFileIds = createSelector(
  [selectTreeSlice],
  (tree) => tree.rootFileIds,
);

export const selectChildrenByFolderId = createSelector(
  [selectTreeSlice],
  (tree) => tree.childrenByFolderId,
);

export const selectChildrenOfFolder = createSelector(
  [
    selectChildrenByFolderId,
    (_state: StateWithCloudFiles, folderId: string) => folderId,
  ],
  (byId, folderId): TreeChildren => byId[folderId] ?? EMPTY_TREE_CHILDREN,
);

export const selectIsFolderFullyLoaded = createSelector(
  [
    selectTreeSlice,
    (_state: StateWithCloudFiles, folderId: string) => folderId,
  ],
  (tree, folderId): boolean => tree.fullyLoadedFolderIds[folderId] === true,
);

// ---------------------------------------------------------------------------
// Tree — sorted children (respects UI sort settings)
// ---------------------------------------------------------------------------

const selectUiSlice = createSelector([selectSlice], (slice) => slice.ui);

export const selectViewMode = createSelector(
  [selectUiSlice],
  (ui) => ui.viewMode,
);

/** Primitive sort inputs — prefer these inside other selectors over `selectSort`'s object. */
export const selectSortBy = createSelector([selectUiSlice], (ui) => ui.sortBy);

export const selectSortDir = createSelector(
  [selectUiSlice],
  (ui) => ui.sortDir,
);

export const selectSort = createSelector(
  [selectSortBy, selectSortDir],
  (sortBy, sortDir) => ({ sortBy, sortDir }),
);

export const selectKindFilter = createSelector(
  [selectUiSlice],
  (ui) => ui.kindFilter,
);

export const selectDetailsLevel = createSelector(
  [selectUiSlice],
  (ui) => ui.detailsLevel,
);

export const selectColumnFilters = createSelector(
  [selectUiSlice],
  (ui) => ui.columnFilters,
);

/** Convenience: true iff any column filter is set away from its default. */
export const selectHasActiveColumnFilters = createSelector(
  [selectColumnFilters],
  (cf) =>
    cf.name.length > 0 ||
    cf.type.length > 0 ||
    cf.extension.length > 0 ||
    cf.mime.length > 0 ||
    cf.path.length > 0 ||
    cf.owner.length > 0 ||
    cf.modified !== "any" ||
    cf.created !== "any" ||
    cf.size !== "any" ||
    cf.access !== "any" ||
    cf.rag.length > 0,
);

export const selectVisibleColumns = createSelector(
  [selectUiSlice],
  (ui) => ui.visibleColumns,
);

/** Tree-wide search box value (mirrors the URL `?q=…`). */
export const selectSearchQuery = createSelector(
  [selectUiSlice],
  (ui) => ui.searchQuery,
);

/** Active sticky chip (Recents / Starred); null when no chip is active. */
export const selectChipFilter = createSelector(
  [selectUiSlice],
  (ui) => ui.chipFilter,
);

export const selectActiveFileId = createSelector(
  [selectUiSlice],
  (ui) => ui.activeFileId,
);

export const selectActiveFolderId = createSelector(
  [selectUiSlice],
  (ui) => ui.activeFolderId,
);

export const selectActiveFile = createSelector(
  [selectAllFilesMap, selectActiveFileId],
  (map, id): CloudFileRecord | null => (id ? (map[id] ?? null) : null),
);

export const selectActiveFolder = createSelector(
  [selectAllFoldersMap, selectActiveFolderId],
  (map, id): CloudFolderRecord | null => (id ? (map[id] ?? null) : null),
);

/** The id of the single item (file or folder) that has visual focus — used to
 *  drive the highlight ring and scroll-into-view after create / upload. */
export const selectFocusedId = createSelector(
  [selectUiSlice],
  (ui) => ui.focusedId,
);

export const selectSortedChildrenOfFolder = createSelector(
  [
    selectChildrenOfFolder,
    selectAllFilesMap,
    selectAllFoldersMap,
    selectSortBy,
    selectSortDir,
  ],
  (children, filesById, foldersById, sortBy, sortDir): TreeChildren =>
    sortChildrenUtil(children, filesById, foldersById, sortBy, sortDir),
);

export const selectSortedRootChildren = createSelector(
  [
    selectRootFolderIds,
    selectRootFileIds,
    selectAllFilesMap,
    selectAllFoldersMap,
    selectSortBy,
    selectSortDir,
  ],
  (folderIds, fileIds, filesById, foldersById, sortBy, sortDir): TreeChildren =>
    sortChildrenUtil(
      { folderIds, fileIds },
      filesById,
      foldersById,
      sortBy,
      sortDir,
    ),
);

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export const selectSelection = createSelector(
  [selectSlice],
  (slice) => slice.selection,
);

export const selectIsSelected = createSelector(
  [selectSelection, (_s: StateWithCloudFiles, id: string) => id],
  (selection, id): boolean => selection.selectedIds.includes(id),
);

export const selectSelectedCount = createSelector(
  [selectSelection],
  (selection): number => selection.selectedIds.length,
);

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export const selectVersionsForFile = createSelector(
  [selectSlice, (_s: StateWithCloudFiles, fileId: string) => fileId],
  (slice, fileId): CloudFileVersion[] =>
    slice.versionsByFileId[fileId] ?? EMPTY_CLOUD_FILE_VERSIONS,
);

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export const selectPermissionsForResource = createSelector(
  [selectSlice, (_s: StateWithCloudFiles, resourceId: string) => resourceId],
  (slice, resourceId): CloudFilePermission[] | undefined =>
    slice.permissionsByResourceId[resourceId],
);

/**
 * Returns the highest permission the given user has on the given file.
 * Ownership returns 'admin'; otherwise derives from the canonical
 * `public.permissions` grants (mapped into the slice) where the grantee
 * matches. Caller must provide userId.
 */
export const selectEffectivePermissionForFile = createSelector(
  [
    selectFileById,
    selectPermissionsForResource,
    (_s: StateWithCloudFiles, _fileId: string, userId: string) => userId,
  ],
  (file, permissions, userId): PermissionLevel | null => {
    if (!file) return null;
    if (file.ownerId === userId) return "admin";
    const order: Record<PermissionLevel, number> = {
      read: 1,
      write: 2,
      admin: 3,
    };
    let best: PermissionLevel | null =
      file.visibility === "public" ? "read" : null;
    if (!permissions) return best;
    for (const perm of permissions) {
      if (perm.granteeId !== userId) continue;
      if (perm.expiresAt && new Date(perm.expiresAt).getTime() < Date.now())
        continue;
      if (!best || order[perm.permissionLevel] > order[best]) {
        best = perm.permissionLevel;
      }
    }
    return best;
  },
);

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

export const selectShareLinksForResource = createSelector(
  [selectSlice, (_s: StateWithCloudFiles, resourceId: string) => resourceId],
  (slice, resourceId): CloudShareLink[] | undefined =>
    slice.shareLinksByResourceId[resourceId],
);

export const selectActiveShareLinksForResource = createSelector(
  [selectShareLinksForResource],
  (links): CloudShareLink[] => {
    if (!links?.length) return EMPTY_CLOUD_SHARE_LINKS;
    const active = links.filter((l) => l.isActive);
    return active.length ? active : EMPTY_CLOUD_SHARE_LINKS;
  },
);

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export const selectAllUploads = createSelector(
  [selectSlice],
  (slice) => slice.uploads,
);

export const selectUploadByRequestId = createSelector(
  [selectAllUploads, (_s: StateWithCloudFiles, requestId: string) => requestId],
  (uploads, requestId): UploadState | undefined => uploads[requestId],
);

export const selectActiveUploads = createSelector(
  [selectAllUploads],
  (uploads): UploadState[] =>
    (Object.values(uploads) as UploadState[]).filter(
      (u) => u.status === "uploading" || u.status === "pending",
    ),
);

/**
 * Every tracked upload — active AND recently completed (success/error) that
 * hasn't been cleared yet — ordered oldest-first so the tray reads top-to-
 * bottom in upload order. The tray auto-dismisses successful entries after a
 * delay, so this map stays bounded. Completed entries are what let a user see
 * WHAT they just uploaded (and jump to it) instead of watching the progress
 * card vanish into a paginated list.
 */
export const selectVisibleUploads = createSelector(
  [selectAllUploads],
  (uploads): UploadState[] =>
    (Object.values(uploads) as UploadState[])
      .slice()
      .sort((a, b) => a.startedAt - b.startedAt),
);

export const selectOverallUploadProgress = createSelector(
  [selectActiveUploads],
  (active): { loaded: number; total: number; percent: number } => {
    let loaded = 0;
    let total = 0;
    for (const u of active) {
      loaded += u.bytesUploaded;
      total += u.fileSize;
    }
    return {
      loaded,
      total,
      percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
    };
  },
);

// ---------------------------------------------------------------------------
// RAG status (per-file indexing)
// ---------------------------------------------------------------------------

const selectRagStatusSlice = createSelector(
  [selectSlice],
  (slice) => slice.ragStatus,
);

/** Map of fileId → current RagStatus. Empty until the prefetch thunk runs. */
export const selectRagStatuses = createSelector(
  [selectRagStatusSlice],
  (rag) => rag.byFileId,
);

export const selectRagStatusForFile = createSelector(
  [selectRagStatuses, (_s: StateWithCloudFiles, fileId: string) => fileId],
  (byId, fileId): RagStatus | undefined => byId[fileId],
);

export const selectIsRagFetching = createSelector(
  [selectRagStatusSlice],
  (rag): boolean => rag.isFetching,
);

export const selectRagLastFetchedAt = createSelector(
  [selectRagStatusSlice],
  (rag): number | null => rag.lastFetchedAt,
);

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

export const selectRealtime = createSelector(
  [selectSlice],
  (slice) => slice.realtime,
);

export const selectRealtimeStatus = createSelector(
  [selectRealtime],
  (rt) => rt.status,
);
