/**
 * features/page-extraction/hooks/usePersistedJobSelection.ts
 *
 * The `selectedJobByFile` slice is in-memory only — refreshing the page
 * loses which template the user was viewing, and the Results tab falls
 * back to "no job selected." This hook bridges the slice to localStorage
 * so the selection survives a refresh.
 *
 * Storage key:  `page-extraction.selectedJob.<fileId>`
 *
 * On mount: if Redux has no selection for this file but localStorage
 * does, hydrate Redux from storage.
 *
 * On change: write Redux's value back to storage. Clearing the selection
 * (jobId=null) removes the key.
 */

"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectJobForFile } from "@/features/page-extraction/redux/pageExtractionSlice";
import { selectSelectedJobForFile } from "@/features/page-extraction/redux/selectors";

const storageKey = (fileId: string) =>
  `page-extraction.selectedJob.${fileId}`;

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* swallow */
  }
}

export function usePersistedJobSelection(fileId: string | null): void {
  const dispatch = useAppDispatch();
  const selectedJobId = useAppSelector((s) =>
    selectSelectedJobForFile(s, fileId),
  );
  // Track which fileId we've already hydrated for, so re-mounts don't
  // overwrite a user's mid-session pick.
  const hydratedFor = useRef<string | null>(null);

  // Hydrate Redux from storage on first mount for this fileId.
  useEffect(() => {
    if (!fileId) return;
    if (hydratedFor.current === fileId) return;
    hydratedFor.current = fileId;
    if (selectedJobId) return; // Redux already has a value; trust it.
    const stored = safeGet(storageKey(fileId));
    if (stored) dispatch(selectJobForFile({ fileId, jobId: stored }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  // Mirror Redux value into storage.
  useEffect(() => {
    if (!fileId) return;
    if (hydratedFor.current !== fileId) return; // wait for hydration step
    safeSet(storageKey(fileId), selectedJobId ?? null);
  }, [fileId, selectedJobId]);
}
