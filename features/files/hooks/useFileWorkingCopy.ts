/**
 * features/files/hooks/useFileWorkingCopy.ts
 *
 * This editor is a VIEW of the file's one working copy — THE working-copy
 * primitive (`lib/working-copy`, kind `file`, `workingCopies["file:<id>"]` in
 * Redux). Any number of editor views hold the same copy; a remount or a wake
 * from `<Activity>` reads it back instead of re-reading bytes, so nothing
 * typed is lost; the last view leaving saves an unsaved copy once.
 *
 * The copy is filled from the file's bytes (`useFileBlob`, cached per file
 * id + version) the first time, and again only when NEW bytes arrive (a new
 * version): a clean copy follows them, a dirty copy keeps the person's text.
 * After a reload, unsaved text kept by the last pagehide comes back as the
 * copy (`readFileDraft`) — or, when the file moved to a newer version since,
 * as a conflict the person resolves.
 */

"use client";

import { useEffect } from "react";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectWorkingCopy, type WorkingCopyEntry } from "@/lib/working-copy/workingCopySlice";
import { clearFileDraft, fileWorkingCopy, readFileDraft } from "@/features/files/redux/working-copy";
import { useFileBlob } from "./useFileBlob";

/**
 * Which file's working copy already holds each blob's text. Module scope so
 * a remounted view (or a second view) never re-reads bytes the copy already
 * has; a new version arrives as a new Blob and is read once.
 */
const blobsInWorkingCopy = new WeakMap<Blob, string>();

export interface UseFileWorkingCopyResult {
  /** Undefined until the file's bytes were first read (`value` is the text). */
  copy: WorkingCopyEntry | undefined;
  loading: boolean;
  error: string | null;
}

export function useFileWorkingCopy(fileId: string): UseFileWorkingCopyResult {
  const store = useAppStore();
  const entry = useAppSelector((s) => selectWorkingCopy(s, fileWorkingCopy.key(fileId)));
  const copy = entry?.value === undefined ? undefined : entry;
  const { blob, error, version } = useFileBlob(fileId);
  const hasCopy = copy !== undefined;

  // This view holds the file's working copy while it is mounted / awake.
  useEffect(() => fileWorkingCopy.attach(fileId, store), [fileId, store]);

  useEffect(() => {
    if (!blob) return undefined;
    if (hasCopy && blobsInWorkingCopy.get(blob) === fileId) return undefined;
    let cancelled = false;
    void blob.text().then((text) => {
      if (cancelled) return;
      blobsInWorkingCopy.set(blob, fileId);
      const draft = readFileDraft(fileId);
      if (draft && draft.text === text) clearFileDraft(fileId);
      // A draft typed on another version than this one is a conflict (the
      // primitive compares `draftBaseVersion` with `version` on adopt).
      fileWorkingCopy.load(fileId, text, {
        version,
        draft: draft && draft.text !== text ? draft.text : null,
        draftBaseVersion: draft?.baseVersion ?? null,
        draftBase: draft?.base ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [blob, fileId, hasCopy, version]);

  return {
    copy,
    loading: !copy && !error,
    error,
  };
}
