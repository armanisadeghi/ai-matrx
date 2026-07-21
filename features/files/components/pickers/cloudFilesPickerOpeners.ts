/**
 * features/files/components/pickers/cloudFilesPickerOpeners.ts
 *
 * Pure-TS, framework-free opener registry + imperative API for the cloud
 * files pickers. Statically importable everywhere (Redux thunks, non-
 * React code, server actions if you want); contains zero React, zero
 * dialog markup, and zero static references to the heavy picker
 * components.
 *
 * The actual `<CloudFilesPickerHost />` (file picker + folder picker +
 * SaveAs dialog) is `next/dynamic`-loaded by the shell at
 * `CloudFilesPickerHost.tsx`. When the host body mounts on the client,
 * it calls `_setOpeners(...)` to populate the registry below; the
 * imperative functions short-circuit to `null`/`undefined` until that
 * happens (and warn in dev). This keeps the FilePicker / FolderPicker /
 * SaveAsDialog dep graph out of every entry's static graph while
 * preserving the existing public import path for callers.
 */

import type { UseFolderPickerOpenOptions } from "./FolderPicker";
import type { SaveAsDestination, UseSaveAsOpenOptions } from "./SaveAsDialog";

/**
 * Options for `openFilePicker`. Since 2026-07-20 the opener mounts THE one
 * canonical file picker (`FilesResourcePicker` in a non-blocking
 * `FilePickerWindow`) — the legacy thin FilePicker dialog is deleted.
 * `allowedExtensions` is mapped to the canonical picker's type filter.
 */
export interface UseFilePickerOpenOptions {
  multi?: boolean;
  initialFolderId?: string | null;
  allowedExtensions?: string[];
  title?: string;
  description?: string;
}

export type FileOpener = (
  options?: UseFilePickerOpenOptions,
) => Promise<string[] | null>;

export type FolderOpener = (
  options?: UseFolderPickerOpenOptions,
) => Promise<string | null | undefined>;

export type SaveAsOpener = (
  options?: UseSaveAsOpenOptions,
) => Promise<SaveAsDestination | null>;

let activeFileOpener: FileOpener | null = null;
let activeFolderOpener: FolderOpener | null = null;
let activeSaveAsOpener: SaveAsOpener | null = null;

// ---------------------------------------------------------------------------
// Internal — called by `<CloudFilesPickerHost />` Impl on mount/unmount.
// Underscore prefix marks them as internal-only — application code should
// continue to use the three `open*` functions below.
// ---------------------------------------------------------------------------

export function _setOpeners(
  file: FileOpener,
  folder: FolderOpener,
  saveAs: SaveAsOpener,
): void {
  activeFileOpener = file;
  activeFolderOpener = folder;
  activeSaveAsOpener = saveAs;
}

export function _clearOpeners(): void {
  activeFileOpener = null;
  activeFolderOpener = null;
  activeSaveAsOpener = null;
}

// ---------------------------------------------------------------------------
// Public imperative API
// ---------------------------------------------------------------------------

/**
 * Open the shared FilePicker. Requires `<CloudFilesPickerHost />` to be
 * mounted somewhere in the tree (typically at the app root). Returns
 * `null` if the host is not yet mounted (the heavy picker chunk is
 * lazy-loaded — calls during the first ~tens of ms after page load can
 * land before the host hydrates).
 */
export async function openFilePicker(
  options: UseFilePickerOpenOptions = {},
): Promise<string[] | null> {
  if (!activeFileOpener) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[cloud-files] openFilePicker called without a mounted <CloudFilesPickerHost />; returning null.",
      );
    }
    return null;
  }
  return activeFileOpener(options);
}

/**
 * Open the shared FolderPicker. Returns the chosen folder id (or `null`
 * for root), or `undefined` if cancelled / host not mounted.
 */
export async function openFolderPicker(
  options: UseFolderPickerOpenOptions = {},
): Promise<string | null | undefined> {
  if (!activeFolderOpener) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[cloud-files] openFolderPicker called without a mounted <CloudFilesPickerHost />.",
      );
    }
    return undefined;
  }
  return activeFolderOpener(options);
}

/** Open the shared SaveAs dialog. */
export async function openSaveAs(
  options: UseSaveAsOpenOptions = {},
): Promise<SaveAsDestination | null> {
  if (!activeSaveAsOpener) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[cloud-files] openSaveAs called without a mounted <CloudFilesPickerHost />.",
      );
    }
    return null;
  }
  return activeSaveAsOpener(options);
}
