/**
 * features/files/components/pickers/CloudFilesPickerHostImpl.tsx
 *
 * Heavy body for `<CloudFilesPickerHost />` — mounts the FilePicker,
 * FolderPicker, and SaveAsDialog and registers the imperative openers
 * with `cloudFilesPickerOpeners.ts` so the public API
 * (`openFilePicker` / `openFolderPicker` / `openSaveAs`) can resolve to
 * a real dialog.
 *
 * Lazy-loaded by `CloudFilesPickerHost.tsx`. Until the chunk loads and
 * the host mounts, the imperative API short-circuits to `null` /
 * `undefined` (with a dev warning). See `cloudFilesPickerOpeners.ts`.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FilePickerWindow,
  type FileSelection,
} from "@/features/resource-manager/resource-picker/FilePickerWindow";
import type { FilesResourcePickerFilter } from "@/features/resource-manager/resource-picker/FilesResourcePicker";
import { FolderPicker, type UseFolderPickerOpenOptions } from "./FolderPicker";
import {
  SaveAsDialog,
  type SaveAsDestination,
  type UseSaveAsOpenOptions,
} from "./SaveAsDialog";
import {
  _setOpeners,
  _clearOpeners,
  type FileOpener,
  type FolderOpener,
  type SaveAsOpener,
  type UseFilePickerOpenOptions,
} from "./cloudFilesPickerOpeners";

/** Best-effort map of a legacy extension allowlist to the canonical filter. */
function filterFromExtensions(
  extensions: string[] | undefined,
): FilesResourcePickerFilter {
  if (!extensions || extensions.length === 0) return "all";
  const set = new Set(extensions.map((e) => e.toLowerCase().replace(/^\./, "")));
  if ([...set].every((e) => e === "pdf")) return "pdfs";
  const imageExts = ["jpg", "jpeg", "png", "webp", "avif", "gif", "svg"];
  if ([...set].every((e) => imageExts.includes(e))) return "photos";
  return "all";
}

export default function CloudFilesPickerHostImpl() {
  // File picker state
  const [fileOpen, setFileOpen] = useState(false);
  const [fileOptions, setFileOptions] =
    useState<UseFilePickerOpenOptions | null>(null);
  const fileResolverRef = useRef<((r: string[] | null) => void) | null>(null);
  // Multi-pick accumulator — the canonical window stays open across picks;
  // closing it resolves the promise with everything collected.
  const pickedFileIdsRef = useRef<string[]>([]);

  // Folder picker state
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderOptions, setFolderOptions] =
    useState<UseFolderPickerOpenOptions | null>(null);
  const folderResolverRef = useRef<
    ((r: string | null | undefined) => void) | null
  >(null);

  // SaveAs state
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsOptions, setSaveAsOptions] =
    useState<UseSaveAsOpenOptions | null>(null);
  const saveAsResolverRef = useRef<
    ((r: SaveAsDestination | null) => void) | null
  >(null);

  const fileOpener: FileOpener = useCallback(
    (options = {}) =>
      new Promise<string[] | null>((resolve) => {
        fileResolverRef.current?.(null);
        fileResolverRef.current = resolve;
        pickedFileIdsRef.current = [];
        setFileOptions(options);
        setFileOpen(true);
      }),
    [],
  );

  const folderOpener: FolderOpener = useCallback(
    (options = {}) =>
      new Promise<string | null | undefined>((resolve) => {
        folderResolverRef.current?.(undefined);
        folderResolverRef.current = resolve;
        setFolderOptions(options);
        setFolderOpen(true);
      }),
    [],
  );

  const saveAsOpener: SaveAsOpener = useCallback(
    (options = {}) =>
      new Promise<SaveAsDestination | null>((resolve) => {
        saveAsResolverRef.current?.(null);
        saveAsResolverRef.current = resolve;
        setSaveAsOptions(options);
        setSaveAsOpen(true);
      }),
    [],
  );

  // Register as the active openers on mount; clear on unmount.
  useEffect(() => {
    _setOpeners(fileOpener, folderOpener, saveAsOpener);
    return () => {
      _clearOpeners();
    };
  }, [fileOpener, folderOpener, saveAsOpener]);

  // File picker handlers. Single pick resolves + closes immediately; multi
  // collects picks and resolves with the batch when the window closes.
  const handleFileClose = useCallback(() => {
    const picked = pickedFileIdsRef.current;
    pickedFileIdsRef.current = [];
    fileResolverRef.current?.(picked.length > 0 ? picked : null);
    fileResolverRef.current = null;
    setFileOpen(false);
  }, []);
  const handleFilePick = useCallback(
    (selection: FileSelection, multi: boolean): void | "close" => {
      if (!multi) {
        fileResolverRef.current?.([selection.fileId]);
        fileResolverRef.current = null;
        pickedFileIdsRef.current = [];
        return "close";
      }
      if (!pickedFileIdsRef.current.includes(selection.fileId)) {
        pickedFileIdsRef.current.push(selection.fileId);
      }
      return undefined;
    },
    [],
  );

  // Folder picker handlers
  const handleFolderOpenChange = useCallback((next: boolean) => {
    if (!next) {
      folderResolverRef.current?.(undefined);
      folderResolverRef.current = null;
    }
    setFolderOpen(next);
  }, []);
  const handleFolderSelect = useCallback((folderId: string | null) => {
    folderResolverRef.current?.(folderId);
    folderResolverRef.current = null;
  }, []);

  // SaveAs handlers
  const handleSaveAsOpenChange = useCallback((next: boolean) => {
    if (!next) {
      saveAsResolverRef.current?.(null);
      saveAsResolverRef.current = null;
    }
    setSaveAsOpen(next);
  }, []);
  const handleSaveAsSave = useCallback((dest: SaveAsDestination) => {
    saveAsResolverRef.current?.(dest);
    saveAsResolverRef.current = null;
  }, []);

  // Memoize picker elements to avoid unnecessary remounts.
  const filePickerElement = useMemo(
    () =>
      fileOptions ? (
        <FilePickerWindow
          open={fileOpen}
          onClose={handleFileClose}
          scopeId="cloud-files-host"
          title={fileOptions.title ?? "Choose a file"}
          initialFilter={filterFromExtensions(fileOptions.allowedExtensions)}
          onPick={(selection) =>
            handleFilePick(selection, fileOptions.multi ?? false)
          }
        />
      ) : null,
    [fileOpen, fileOptions, handleFileClose, handleFilePick],
  );

  const folderPickerElement = useMemo(
    () =>
      folderOptions ? (
        <FolderPicker
          open={folderOpen}
          onOpenChange={handleFolderOpenChange}
          onSelect={handleFolderSelect}
          initialFolderId={folderOptions.initialFolderId}
          title={folderOptions.title}
          description={folderOptions.description}
        />
      ) : null,
    [folderOpen, folderOptions, handleFolderOpenChange, handleFolderSelect],
  );

  const saveAsElement = useMemo(
    () =>
      saveAsOptions ? (
        <SaveAsDialog
          open={saveAsOpen}
          onOpenChange={handleSaveAsOpenChange}
          onSave={handleSaveAsSave}
          defaultFileName={saveAsOptions.defaultFileName}
          initialFolderId={saveAsOptions.initialFolderId ?? null}
          title={saveAsOptions.title}
          description={saveAsOptions.description}
          confirmLabel={saveAsOptions.confirmLabel}
        />
      ) : null,
    [saveAsOpen, saveAsOptions, handleSaveAsOpenChange, handleSaveAsSave],
  );

  return (
    <>
      {filePickerElement}
      {folderPickerElement}
      {saveAsElement}
    </>
  );
}
