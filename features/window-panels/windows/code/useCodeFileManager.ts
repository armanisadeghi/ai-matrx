"use client";

// features/window-panels/windows/code/useCodeFileManager.ts
//
// State and actions for the CodeFileManagerWindow. Owns:
//   - Folder tree expand state (per-instance, not persisted)
//   - Selected folder id (null = root / "unfiled")
//   - Search query (filters the file list and folder tree)
//   - CRUD handlers: new file, new folder, rename, delete, move
//
// Data hydration is side-effecty: the hook kicks off loadCodeFilesList +
// loadCodeFolders on mount if they haven't been loaded yet. Everything else
// is local UI state.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllCodeFiles,
  selectAllCodeFolders,
  selectCodeFilesListStatus,
  selectCodeFoldersLoaded,
} from "@/features/code-files/redux/selectors";
import {
  createCodeFileThunk,
  createCodeFolderThunk,
  deleteCodeFileThunk,
  deleteCodeFolderThunk,
  loadCodeFilesList,
  loadCodeFolders,
  saveFileNow,
  updateCodeFolderThunk,
} from "@/features/code-files/redux/thunks";
import { codeFilesActions } from "@/features/code-files/redux/slice";
import {
  extensionForLanguage,
  languageFromName,
} from "@/features/code-files/actions/languageOptions";
import type {
  CodeFileRecord,
  CodeFolder,
} from "@/features/code-files/redux/code-files.types";

// Synthetic id for the "unfiled" root group in the tree.
export const ROOT_FOLDER_ID = "__root__";

export type FolderKey = string | typeof ROOT_FOLDER_ID;

export interface FolderNode {
  /** DB folder id, or ROOT_FOLDER_ID for the synthetic root group. */
  id: FolderKey;
  name: string;
  parentId: string | null;
  children: FolderNode[];
  /** Count of (non-deleted) files that live directly inside this folder. */
  fileCount: number;
}

export type SortBy = "updated" | "name" | "language";

function buildFolderTree(
  folders: CodeFolder[],
  files: CodeFileRecord[],
): FolderNode[] {
  const byParent = new Map<string | null, CodeFolder[]>();
  for (const f of folders) {
    const parent = f.parent_folder_id ?? null;
    const group = byParent.get(parent);
    if (group) {
      group.push(f);
    } else {
      byParent.set(parent, [f]);
    }
  }
  // Count files per folder (null = root/"unfiled").
  const fileCounts = new Map<string | null, number>();
  for (const file of files) {
    if (file.is_deleted) continue;
    const key = file.folder_id ?? null;
    fileCounts.set(key, (fileCounts.get(key) ?? 0) + 1);
  }

  const build = (parentId: string | null): FolderNode[] => {
    const kids = byParent.get(parentId) ?? [];
    return kids
      .slice()
      .sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.name.localeCompare(b.name);
      })
      .map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parent_folder_id ?? null,
        children: build(f.id),
        fileCount: fileCounts.get(f.id) ?? 0,
      }));
  };

  const rootNode: FolderNode = {
    id: ROOT_FOLDER_ID,
    name: "Unfiled",
    parentId: null,
    children: [],
    fileCount: fileCounts.get(null) ?? 0,
  };

  return [rootNode, ...build(null)];
}

function matchesSearch(value: string, query: string): boolean {
  if (!query) return true;
  return value.toLowerCase().includes(query.toLowerCase());
}

function sortFiles(files: CodeFileRecord[], by: SortBy): CodeFileRecord[] {
  const next = files.slice();
  switch (by) {
    case "name":
      next.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "language":
      next.sort(
        (a, b) =>
          (a.language ?? "").localeCompare(b.language ?? "") ||
          a.name.localeCompare(b.name),
      );
      break;
    case "updated":
    default:
      next.sort((a, b) => {
        if (a.updated_at === b.updated_at) return 0;
        return a.updated_at < b.updated_at ? 1 : -1;
      });
      break;
  }
  return next;
}

export interface UseCodeFileManagerResult {
  // Data
  tree: FolderNode[];
  folders: CodeFolder[];
  selectedFolderId: string | null;
  visibleFiles: CodeFileRecord[];
  allFilesCount: number;

  // Loading
  isLoadingList: boolean;
  isLoadingFolders: boolean;
  error: string | null;

  // Search / sort / selection
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  selectedFileIds: string[];
  toggleFileSelection: (id: string) => void;
  clearFileSelection: () => void;
  setSelectedFolderId: (id: string | null) => void;

  // Tree expand
  expandedFolders: Set<string>;
  toggleFolderExpanded: (id: string) => void;
  isFolderExpanded: (id: FolderKey) => boolean;

  // CRUD
  createNewFile: () => Promise<string | null>;
  createNewFolder: (name: string, parentId?: string | null) => Promise<void>;
  renameFile: (id: string, newName: string) => Promise<void>;
  renameFolder: (id: string, newName: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  deleteSelectedFiles: () => Promise<void>;
  moveFileToFolder: (fileId: string, folderId: string | null) => Promise<void>;

  // Persisted open hook
  openFileIdsInEditor: (ids: string[], title?: string) => void;
}

export function useCodeFileManager(): UseCodeFileManagerResult {
  const dispatch = useAppDispatch();

  const files = useAppSelector(selectAllCodeFiles);
  const folders = useAppSelector(selectAllCodeFolders);
  const listStatus = useAppSelector(selectCodeFilesListStatus);
  const foldersLoaded = useAppSelector(selectCodeFoldersLoaded);
  const listError = useAppSelector((s) => s.codeFiles.listError);

  // ── Local UI state ────────────────────────────────────────────────────────
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("updated");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set([ROOT_FOLDER_ID]),
  );
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  // ── Hydrate from server once ──────────────────────────────────────────────
  useEffect(() => {
    if (listStatus === "idle") {
      void dispatch(loadCodeFilesList());
    }
  }, [dispatch, listStatus]);

  useEffect(() => {
    if (!foldersLoaded) {
      void dispatch(loadCodeFolders());
    }
  }, [dispatch, foldersLoaded]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const tree = useMemo(() => buildFolderTree(folders, files), [folders, files]);

  const visibleFiles = useMemo(() => {
    const filtered = files.filter((f) => {
      if (f.is_deleted) return false;
      if (selectedFolderId === null) {
        // Root view — show everything unfiled OR show all if searching
        if (searchQuery) return matchesSearch(f.name, searchQuery);
        return f.folder_id === null;
      }
      if ((f.folder_id ?? null) !== selectedFolderId) return false;
      return matchesSearch(f.name, searchQuery);
    });
    return sortFiles(filtered, sortBy);
  }, [files, selectedFolderId, searchQuery, sortBy]);

  // ── Tree expand ───────────────────────────────────────────────────────────
  const isFolderExpanded = useCallback(
    (id: FolderKey) => expandedFolders.has(id as string),
    [expandedFolders],
  );

  const toggleFolderExpanded = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleFileSelection = useCallback((id: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const clearFileSelection = useCallback(() => setSelectedFileIds([]), []);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const createNewFile = useCallback(async (): Promise<string | null> => {
    const folder_id = selectedFolderId;
    // Pick a default filename that doesn't collide with existing ones in the
    // same folder. Language defaults to plaintext; user can rename / change.
    const inFolder = files.filter(
      (f) => (f.folder_id ?? null) === folder_id && !f.is_deleted,
    );
    let n = inFolder.length + 1;
    let name = `untitled-${n}.txt`;
    const used = new Set(inFolder.map((f) => f.name));
    while (used.has(name)) {
      n += 1;
      name = `untitled-${n}.txt`;
    }
    const result = await dispatch(
      createCodeFileThunk({
        name,
        folder_id,
        language: languageFromName(name),
        content: "",
      }),
    );
    if (createCodeFileThunk.fulfilled.match(result)) {
      return result.payload.id;
    }
    return null;
  }, [dispatch, files, selectedFolderId]);

  const createNewFolder = useCallback(
    async (name: string, parentId?: string | null) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await dispatch(
        createCodeFolderThunk({
          name: trimmed,
          parent_folder_id: parentId ?? selectedFolderId ?? null,
        }),
      );
    },
    [dispatch, selectedFolderId],
  );

  const renameFile = useCallback(
    async (id: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const nextLanguage = languageFromName(trimmed);
      dispatch(codeFilesActions.setLocalName({ id, name: trimmed }));
      dispatch(
        codeFilesActions.setLocalLanguage({ id, language: nextLanguage }),
      );
      await dispatch(saveFileNow({ id }));
    },
    [dispatch],
  );

  const renameFolder = useCallback(
    async (id: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      await dispatch(updateCodeFolderThunk({ id, updates: { name: trimmed } }));
    },
    [dispatch],
  );

  const deleteFile = useCallback(
    async (id: string) => {
      await dispatch(deleteCodeFileThunk(id));
      setSelectedFileIds((prev) => prev.filter((x) => x !== id));
    },
    [dispatch],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      await dispatch(deleteCodeFolderThunk(id));
      if (selectedFolderId === id) setSelectedFolderId(null);
    },
    [dispatch, selectedFolderId],
  );

  const deleteSelectedFiles = useCallback(async () => {
    const ids = selectedFileIds.slice();
    for (const id of ids) {
      await dispatch(deleteCodeFileThunk(id));
    }
    setSelectedFileIds([]);
  }, [dispatch, selectedFileIds]);

  const moveFileToFolder = useCallback(
    async (fileId: string, folderId: string | null) => {
      dispatch(
        codeFilesActions.setLocalFolder({ id: fileId, folder_id: folderId }),
      );
      await dispatch(saveFileNow({ id: fileId }));
    },
    [dispatch],
  );

  // ── Persisted editor integration ──────────────────────────────────────────
  const openFileIdsInEditor = useCallback(
    (ids: string[], title?: string) => {
      if (ids.length === 0) return;
      // Lazy import to avoid circular dependency with overlaySlice in tests.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { openOverlay } = require("@/lib/redux/slices/overlaySlice");
      dispatch(
        openOverlay({
          overlayId: "codeEditorWindow",
          instanceId: `code-editor-${Date.now()}`,
          data: {
            fileIds: ids,
            activeFileId: ids[0],
            title: title ?? null,
          },
        }),
      );
    },
    [dispatch],
  );

  return {
    tree,
    folders,
    selectedFolderId,
    visibleFiles,
    allFilesCount: files.filter((f) => !f.is_deleted).length,

    isLoadingList: listStatus === "loading",
    isLoadingFolders: !foldersLoaded,
    error: listError,

    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    selectedFileIds,
    toggleFileSelection,
    clearFileSelection,
    setSelectedFolderId,

    expandedFolders,
    toggleFolderExpanded,
    isFolderExpanded,

    createNewFile,
    createNewFolder,
    renameFile,
    renameFolder,
    deleteFile,
    deleteFolder,
    deleteSelectedFiles,
    moveFileToFolder,

    openFileIdsInEditor,
  };
}

// Re-export for convenience.
export { extensionForLanguage, languageFromName };
