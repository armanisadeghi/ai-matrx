"use client";

/**
 * useCodeEditorWindowState
 *
 * Self-contained state for the CodeEditorWindow. Supports two modes:
 *
 *  1. In-memory (legacy): pass `initialFiles`. Files live only in local
 *     component state; closing the window drops them.
 *
 *  2. Persisted: pass `fileIds`. The hook loads those files from the
 *     code_files slice (dispatching a full-content thunk on mount),
 *     derives CodeFile[] from Redux, and routes edits back through
 *     `setLocalContent` so the auto-save middleware handles persistence.
 *
 * The outer component doesn't need to know which mode is active — it
 * receives the same `files`, `currentFile`, `handleContentChange`, and tab
 * state in both cases.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useMeasure } from "@/hooks/usehooks";
import type { CodeFile } from "@/features/code-editor/multi-file-core/types";
import {
  mapLanguageForMonaco,
  getMonacoFileExtension,
} from "@/features/code-editor/config/languages";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  loadCodeFilesFull,
  saveFileNow,
} from "@/features/code-files/redux/thunks";
import { codeFilesActions } from "@/features/code-files/redux/slice";
import { selectCodeFilesMap } from "@/features/code-files/redux/selectors";
import type { CodeFileRecord } from "@/features/code-files/redux/code-files.types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseCodeEditorWindowStateProps {
  /** In-memory mode: static files bundled with the window-open payload. */
  initialFiles?: CodeFile[];
  /**
   * Persisted mode: ids of code_files rows to hydrate and edit. When provided,
   * `initialFiles` is ignored and all edits flow through Redux / auto-save.
   */
  fileIds?: string[];
  /** Path or fileId of the tab to show on open. */
  initialActiveFile?: string | null;
}

// Persisted mode uses the file `id` as the tab path (unique + stable).
function recordToCodeFile(rec: CodeFileRecord): CodeFile {
  return {
    name: rec.name,
    path: rec.id,
    language: rec.language,
    content: rec.content,
    readOnly: rec.is_readonly,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCodeEditorWindowState({
  initialFiles,
  fileIds,
  initialActiveFile,
}: UseCodeEditorWindowStateProps) {
  const dispatch = useAppDispatch();
  const isPersisted = Array.isArray(fileIds) && fileIds.length > 0;

  // ── Load persisted files on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!isPersisted || !fileIds) return;
    void dispatch(loadCodeFilesFull({ ids: fileIds }));
  }, [dispatch, fileIds, isPersisted]);

  // ── Persisted-mode files (from Redux) ─────────────────────────────────────
  const filesMap = useAppSelector(selectCodeFilesMap);
  const persistedFiles = useMemo<CodeFile[]>(() => {
    if (!isPersisted || !fileIds) return [];
    const out: CodeFile[] = [];
    for (const id of fileIds) {
      const rec = filesMap[id];
      if (rec && !rec.deleted_at) out.push(recordToCodeFile(rec));
    }
    return out;
  }, [filesMap, fileIds, isPersisted]);

  // ── In-memory mode files (local state) ────────────────────────────────────
  const [inMemoryFiles, setInMemoryFiles] = useState<CodeFile[]>(
    initialFiles ?? [],
  );

  const files = isPersisted ? persistedFiles : inMemoryFiles;
  const setFiles = isPersisted
    ? (next: CodeFile[] | ((f: CodeFile[]) => CodeFile[])) => {
        // Persisted mode — edits flow through Redux, but allow external
        // callers (e.g. adding a new tab) to be a no-op rather than throw.
        void next;
      }
    : setInMemoryFiles;

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Seed open tab + activeTab from props once files are available.
  useEffect(() => {
    if (files.length === 0) return;
    if (openTabs.length > 0) return;
    const path = initialActiveFile ?? files[0].path;
    setOpenTabs([path]);
    setActiveTab(path);
  }, [files, initialActiveFile, openTabs.length]);

  // ── Editor settings ───────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [showWrapLines, setShowWrapLines] = useState(false);
  const [minimapEnabled, setMinimapEnabled] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(true);
  const [formatTrigger, setFormatTrigger] = useState(0);
  const [isCopied, setIsCopied] = useState(false);

  // ── Monaco height measurement ─────────────────────────────────────────────
  const [editorWrapperRef, { height: editorWrapperHeight }] =
    useMeasure<HTMLDivElement>();

  const editorHeight = editorWrapperHeight
    ? `${editorWrapperHeight}px`
    : undefined;

  // ── Derived current file ──────────────────────────────────────────────────
  const currentFile = files.find((f) => f.path === activeTab) ?? null;

  // ── Tab helpers ───────────────────────────────────────────────────────────
  const openFile = useCallback((path: string) => {
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveTab(path);
  }, []);

  const closeTab = useCallback(
    (path: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setOpenTabs((prev) => {
        const filtered = prev.filter((p) => p !== path);
        if (activeTab === path) {
          const idx = prev.indexOf(path);
          const newActive = filtered[Math.max(0, idx - 1)] ?? null;
          setActiveTab(newActive);
        }
        return filtered;
      });
    },
    [activeTab],
  );

  const selectTab = useCallback((path: string) => {
    setActiveTab(path);
  }, []);

  // ── Content change ────────────────────────────────────────────────────────
  // In persisted mode we dispatch to Redux (auto-save middleware handles the
  // actual save). In-memory mode updates local state only.
  const handleContentChange = useCallback(
    (content: string | undefined) => {
      if (content === undefined || !activeTab) return;
      if (isPersisted) {
        dispatch(codeFilesActions.setLocalContent({ id: activeTab, content }));
        return;
      }
      setInMemoryFiles((prev) =>
        prev.map((f) => (f.path === activeTab ? { ...f, content } : f)),
      );
    },
    [activeTab, dispatch, isPersisted],
  );

  // ── Explicit save (persisted mode only) ───────────────────────────────────
  const handleSaveNow = useCallback(() => {
    if (!isPersisted || !activeTab) return;
    void dispatch(saveFileNow({ id: activeTab }));
  }, [activeTab, dispatch, isPersisted]);

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!currentFile) return;
    await navigator.clipboard.writeText(currentFile.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [currentFile]);

  // ── Format ────────────────────────────────────────────────────────────────
  const handleFormat = useCallback(() => {
    if (!isEditing) return;
    setFormatTrigger((n) => n + 1);
  }, [isEditing]);

  // ── Monaco path + language helpers ────────────────────────────────────────
  const getEditorPath = useCallback((file: CodeFile): string => {
    const ext = getMonacoFileExtension(file.language);
    if (ext) {
      const base = file.path.replace(/\.[^.]+$/, "");
      return `${base}${ext}`;
    }
    return file.path;
  }, []);

  // ── Dirty / saving state for UI indicator (persisted mode) ────────────────
  const currentRecord: CodeFileRecord | undefined =
    isPersisted && activeTab ? filesMap[activeTab] : undefined;
  const isDirty = !!currentRecord?._dirty;
  const isSaving = !!currentRecord?._saving;
  const saveError = currentRecord?._error ?? null;

  return {
    // File data
    files,
    setFiles,
    currentFile,

    // Tab state
    openTabs,
    activeTab,
    openFile,
    closeTab,
    selectTab,

    // Editor settings
    isEditing,
    setIsEditing,
    showWrapLines,
    setShowWrapLines,
    minimapEnabled,
    setMinimapEnabled,
    lineNumbers,
    setLineNumbers,
    formatTrigger,
    isCopied,

    // Callbacks
    handleContentChange,
    handleCopy,
    handleFormat,
    handleSaveNow,

    // Monaco helpers
    getEditorPath,
    mapLanguageForMonaco,

    // Height ref for Monaco
    editorWrapperRef,
    editorHeight,

    // Persisted-mode state
    isPersisted,
    isDirty,
    isSaving,
    saveError,
  };
}
