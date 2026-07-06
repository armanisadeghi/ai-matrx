// features/code-files/redux/selectors.ts
//
// Memoized selectors for the code-files slice. Pattern is deliberately simple:
//   - Global selectors read the slice directly.
//   - Per-file selectors are factory functions cached by id so callers get a
//     stable selector instance per file across renders (mirrors the notes
//     selectors pattern, lighter weight).

import { createSelector } from "@reduxjs/toolkit";
import type { CodeFilesSliceState, CodeFileRecord, CodeFolder } from "./code-files.types";

type StateWithCodeFiles = { codeFiles: CodeFilesSliceState };

// ── Base ────────────────────────────────────────────────────────────────────

const selectSlice = (state: StateWithCodeFiles) => state.codeFiles;

export const selectCodeFilesMap = (state: StateWithCodeFiles) => state.codeFiles.files;
export const selectCodeFoldersMap = (state: StateWithCodeFiles) =>
  state.codeFiles.folders;

export const selectCodeFilesListStatus = (state: StateWithCodeFiles) =>
  state.codeFiles.listStatus;

export const selectCodeFilesListError = (state: StateWithCodeFiles) =>
  state.codeFiles.listError;

export const selectCodeFoldersLoaded = (state: StateWithCodeFiles) =>
  state.codeFiles.foldersLoaded;

// ── Flat arrays ─────────────────────────────────────────────────────────────

export const selectAllCodeFiles = createSelector(selectCodeFilesMap, (map) =>
  Object.values(map),
);

export const selectAllCodeFolders = createSelector(
  selectCodeFoldersMap,
  (map) => Object.values(map),
);

// ── Per-file ────────────────────────────────────────────────────────────────

const fileSelectorCache = new Map<
  string,
  (state: StateWithCodeFiles) => CodeFileRecord | undefined
>();

/** Stable per-file selector — same reference across renders for the same id. */
export function makeSelectCodeFile(
  id: string,
): (state: StateWithCodeFiles) => CodeFileRecord | undefined {
  const cached = fileSelectorCache.get(id);
  if (cached) return cached;
  const fn = (state: StateWithCodeFiles) => state.codeFiles.files[id];
  fileSelectorCache.set(id, fn);
  return fn;
}

export function selectCodeFileById(
  state: StateWithCodeFiles,
  id: string,
): CodeFileRecord | undefined {
  return state.codeFiles.files[id];
}

// ── Folder-scoped ───────────────────────────────────────────────────────────

export const selectTopLevelFolders = createSelector(
  selectAllCodeFolders,
  (folders) => folders.filter((f) => !f.parent_folder_id),
);

/** Children of a given folder (one level). */
export function makeSelectChildFolders(parentId: string | null) {
  return createSelector(selectAllCodeFolders, (folders) =>
    folders.filter((f) =>
      parentId === null ? !f.parent_folder_id : f.parent_folder_id === parentId,
    ),
  );
}

/** Files inside a given folder (null = loose/unfiled). */
export function makeSelectFilesInFolder(folderId: string | null) {
  return createSelector(selectAllCodeFiles, (files) =>
    files.filter((f) => !f.deleted_at && f.folder_id === folderId),
  );
}

// ── Dirty files ─────────────────────────────────────────────────────────────

export const selectDirtyCodeFiles = createSelector(
  selectAllCodeFiles,
  (files) => files.filter((f) => f._dirty),
);

export const selectHasUnsavedCodeChanges = createSelector(
  selectDirtyCodeFiles,
  (dirty) => dirty.length > 0,
);

// ── Convenience ─────────────────────────────────────────────────────────────

export const selectFolderById = (
  state: StateWithCodeFiles,
  id: string,
): CodeFolder | undefined => state.codeFiles.folders[id];

export const selectCodeFilesSliceLoaded = createSelector(
  selectSlice,
  (s) => s.listStatus === "loaded",
);
