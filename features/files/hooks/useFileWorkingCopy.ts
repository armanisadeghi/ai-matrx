/**
 * features/files/hooks/useFileWorkingCopy.ts
 *
 * The working copy of one text file, from the store (`CloudFilesState.
 * workingCopies`). Any number of editor views call this for the same file
 * and get the same copy; a remount or a wake from `<Activity>` reads the
 * copy back instead of re-reading bytes, so nothing typed is lost.
 *
 * The copy is filled from the file's bytes (`useFileBlob`, cached per file
 * id + version) the first time, and again only when NEW bytes arrive (a new
 * version): a clean copy follows them, a dirty copy keeps the person's text.
 * After a reload, unsaved text kept by the last pagehide comes back as the
 * copy (`readFileDraft`).
 */

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFileWorkingCopy } from "@/features/files/redux/selectors";
import { workingCopyLoaded } from "@/features/files/redux/slice";
import { clearFileDraft, readFileDraft } from "@/features/files/redux/working-copy";
import type { FileWorkingCopy } from "@/features/files/types";
import { useFileBlob } from "./useFileBlob";

/**
 * Which file's working copy already holds each blob's text. Module scope so
 * a remounted view (or a second view) never re-reads bytes the copy already
 * has; a new version arrives as a new Blob and is read once.
 */
const blobsInWorkingCopy = new WeakMap<Blob, string>();

export interface UseFileWorkingCopyResult {
  /** Undefined until the file's bytes were first read. */
  copy: FileWorkingCopy | undefined;
  loading: boolean;
  error: string | null;
}

export function useFileWorkingCopy(fileId: string): UseFileWorkingCopyResult {
  const dispatch = useAppDispatch();
  const copy = useAppSelector((s) => selectFileWorkingCopy(s, fileId));
  const { blob, error, version } = useFileBlob(fileId);
  const hasCopy = copy !== undefined;

  useEffect(() => {
    if (!blob) return undefined;
    if (hasCopy && blobsInWorkingCopy.get(blob) === fileId) return undefined;
    let cancelled = false;
    void blob.text().then((text) => {
      if (cancelled) return;
      blobsInWorkingCopy.set(blob, fileId);
      const draft = readFileDraft(fileId);
      if (draft && draft.text === text) clearFileDraft(fileId);
      dispatch(
        workingCopyLoaded({
          fileId,
          text,
          version,
          draft: draft && draft.text !== text ? draft.text : null,
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [blob, fileId, hasCopy, version, dispatch]);

  return {
    copy,
    loading: !copy && !error,
    error,
  };
}
