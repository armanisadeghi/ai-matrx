"use client";
// features/code-files/actions/useQuickSaveCode.ts
//
// Hook backing QuickSaveCodeCore. Handles local form state, folder listing,
// and the final dispatch to createCodeFileThunk or saveFileNow. Keeps no
// opinion about how the UI is presented (dialog, overlay, popover) — that's
// the wrapper's job.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllCodeFiles,
  selectAllCodeFolders,
  selectCodeFilesListStatus,
  selectCodeFoldersLoaded,
} from "../redux/selectors";
import {
  createCodeFileThunk,
  createCodeFolderThunk,
  loadCodeFilesList,
  loadCodeFolders,
  saveFileNow,
} from "../redux/thunks";
import type {
  CodeFile,
  CodeFileRecord,
  CodeFolder,
} from "../redux/code-files.types";
import { codeFilesActions } from "../redux/slice";
import {
  extensionForLanguage,
  LANGUAGE_OPTIONS,
  languageFromName,
} from "./languageOptions";
import { useToastManager } from "@/hooks/useToastManager";

export type SaveMode = "create" | "update";
export type UpdateMethod = "append" | "overwrite";

export interface UseQuickSaveCodeArgs {
  initialContent: string;
  /** Optional initial language guess (from the source code block). */
  initialLanguage?: string;
  /** Optional filename suggestion. */
  suggestedName?: string;
  /** Folder to pre-select (id). */
  defaultFolderId?: string | null;
}

function defaultCodeName(language: string): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const time = now
    .toLocaleTimeString("en-US", { hour12: false })
    .replace(/:/g, "-");
  const ext = extensionForLanguage(language);
  return `snippet-${date.replace(/[\s,]+/g, "-")}-${time}.${ext}`;
}

export function useQuickSaveCode({
  initialContent,
  initialLanguage,
  suggestedName,
  defaultFolderId = null,
}: UseQuickSaveCodeArgs) {
  const dispatch = useAppDispatch();
  const toast = useToastManager("code-files");

  const allFiles = useAppSelector(selectAllCodeFiles);
  const folders = useAppSelector(selectAllCodeFolders);
  const listStatus = useAppSelector(selectCodeFilesListStatus);
  const foldersLoaded = useAppSelector(selectCodeFoldersLoaded);

  useEffect(() => {
    if (listStatus === "idle" || listStatus === "error") {
      void dispatch(loadCodeFilesList());
    }
  }, [listStatus, dispatch]);

  useEffect(() => {
    if (!foldersLoaded) {
      void dispatch(loadCodeFolders());
    }
  }, [foldersLoaded, dispatch]);

  // ── Editable content ───────────────────────────────────────────────────
  const [content, setContent] = useState(initialContent);
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  // ── Target form state ──────────────────────────────────────────────────
  const firstLanguage = initialLanguage ?? "plaintext";
  const [language, setLanguage] = useState(firstLanguage);
  const [name, setName] = useState(
    () => (suggestedName ?? "").trim() || defaultCodeName(firstLanguage),
  );

  // If the user changes the language and the name was still the auto-default,
  // refresh the extension in the name.
  useEffect(() => {
    setName((prev) => {
      if (!prev.startsWith("snippet-")) return prev;
      return defaultCodeName(language);
    });
  }, [language]);

  // Derive language from filename when the user types a dotted name.
  const handleNameChange = useCallback((next: string) => {
    setName(next);
    const fromName = languageFromName(next);
    if (fromName !== "plaintext") setLanguage(fromName);
  }, []);

  const [folderId, setFolderId] = useState<string | null>(defaultFolderId);
  const [mode, setMode] = useState<SaveMode>("create");
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [updateMethod, setUpdateMethod] = useState<UpdateMethod>("append");

  // Reset selected file when filter changes.
  useEffect(() => {
    setSelectedFileId("");
  }, [folderId, mode]);

  const filesInFolder = useMemo(
    () => allFiles.filter((f) => !f.deleted_at && f.folder_id === folderId),
    [allFiles, folderId],
  );

  const selectedFile: CodeFileRecord | undefined = useMemo(
    () => allFiles.find((f) => f.id === selectedFileId),
    [allFiles, selectedFileId],
  );

  // ── Save lifecycle ─────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [savedFile, setSavedFile] = useState<CodeFile | null>(null);

  const save = useCallback(async (): Promise<CodeFile | null> => {
    if (!content.trim()) {
      toast.error("Content cannot be empty");
      return null;
    }
    if (mode === "update" && (!selectedFileId || !selectedFile)) {
      toast.error("Please select a file to update");
      return null;
    }

    setIsSaving(true);
    try {
      if (mode === "create") {
        const created = await dispatch(
          createCodeFileThunk({
            name: name.trim() || defaultCodeName(language),
            language,
            content,
            folder_id: folderId,
            tags: [],
          }),
        ).unwrap();
        toast.success(`Saved as ${created.name}`);
        setSavedFile(created);
        return created;
      }

      // Update path — write new content then flush.
      const finalContent =
        updateMethod === "append"
          ? `${selectedFile!.content ?? ""}\n\n${content}`
          : content;

      dispatch(
        codeFilesActions.setLocalContent({
          id: selectedFileId,
          content: finalContent,
        }),
      );
      const saved = await dispatch(
        saveFileNow({ id: selectedFileId }),
      ).unwrap();
      if (saved) {
        toast.success(
          updateMethod === "append"
            ? `Appended to ${selectedFile?.name}`
            : `Overwrote ${selectedFile?.name}`,
        );
        setSavedFile(saved);
        return saved;
      }
      return null;
    } catch (err) {
      console.error("[useQuickSaveCode] save failed", err);
      toast.error("Failed to save code file");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [
    content,
    mode,
    name,
    language,
    folderId,
    selectedFile,
    selectedFileId,
    updateMethod,
    dispatch,
    toast,
  ]);

  const createFolder = useCallback(
    async (folderName: string): Promise<CodeFolder | null> => {
      const trimmed = folderName.trim();
      if (!trimmed) {
        toast.error("Folder name cannot be empty");
        return null;
      }
      try {
        const folder = await dispatch(
          createCodeFolderThunk({ name: trimmed }),
        ).unwrap();
        setFolderId(folder.id);
        toast.success(`Created folder "${folder.name}"`);
        return folder;
      } catch (err) {
        console.error("[useQuickSaveCode] createFolder failed", err);
        toast.error("Failed to create folder");
        return null;
      }
    },
    [dispatch, toast],
  );

  const reset = useCallback(() => {
    setContent(initialContent);
    setName(defaultCodeName(firstLanguage));
    setLanguage(firstLanguage);
    setFolderId(defaultFolderId);
    setMode("create");
    setSelectedFileId("");
    setUpdateMethod("append");
    setSavedFile(null);
    setIsSaving(false);
  }, [initialContent, firstLanguage, defaultFolderId]);

  const isSaveDisabled =
    isSaving ||
    !content.trim() ||
    (mode === "update" && !selectedFileId) ||
    (mode === "create" && !name.trim());

  return {
    // content
    content,
    setContent,

    // target
    name,
    setName: handleNameChange,
    language,
    setLanguage,
    folderId,
    setFolderId,
    mode,
    setMode,
    selectedFileId,
    setSelectedFileId,
    selectedFile,
    updateMethod,
    setUpdateMethod,

    // data
    folders: folders as CodeFolder[],
    filesInFolder,
    languageOptions: LANGUAGE_OPTIONS,

    // folder actions
    createFolder,

    // lifecycle
    isSaving,
    isSaveDisabled,
    savedFile,
    save,
    reset,
  };
}
