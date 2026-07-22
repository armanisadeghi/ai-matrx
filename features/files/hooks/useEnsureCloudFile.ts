"use client";

/**
 * useEnsureCloudFile — guarantees a single cloud file is present in the
 * files Redux store, fetching it once via direct Supabase if it isn't.
 *
 * The files-route action surfaces (FileContextMenu, FileRightClickMenu,
 * FileInfoDialog, useFileActions, PreviewPane, FilePreview) all read the
 * file from `selectFileById` — they degrade when the row is absent. Any
 * surface OUTSIDE the `/files` tree (marketing captures, PDF studio,
 * chat chips, pickers, the floating `filePreviewWindow`) that opens a
 * viewer by canonical file UUID MUST call this so the row hydrates
 * without forcing the whole files tree to load.
 *
 * Crawl/system artifacts (`metadata.system_artifact` + `artifact_domain`)
 * are intentionally NOT discoverable in the Files tree, but site viewers
 * can still read the row via RLS (`files.has_access_for`). Direct
 * supabase-js is the FE-canonical path for that metadata read.
 *
 * No-op when the file is already in the store, the id is empty, or the id
 * is synthetic/virtual (those don't go through `files.files`).
 */

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { upsertFile } from "@/features/files/redux/slice";
import { dbRowToCloudFile } from "@/features/files/redux/converters";
import { isSyntheticId } from "@/features/files/virtual-sources/path";
import { FILES_TABLE_COLUMNS, filesDb } from "@/features/files/filesDb";
import { supabase } from "@/utils/supabase/client";
import type { CloudFileReadRow } from "@/features/files/types";

export type EnsureCloudFileStatus =
  "idle" | "ready" | "loading" | "missing" | "error";

export interface EnsureCloudFileResult {
  status: EnsureCloudFileStatus;
  error: string | null;
}

type FetchOutcome =
  | { kind: "ready"; row: CloudFileReadRow }
  | { kind: "missing" }
  | { kind: "error"; message: string };

/** Concurrent mounts (PreviewPane + FilePreview) share one network round-trip. */
const inflightById = new Map<string, Promise<FetchOutcome>>();

async function fetchFileRow(fileId: string): Promise<FetchOutcome> {
  const existing = inflightById.get(fileId);
  if (existing) return existing;

  const promise = (async (): Promise<FetchOutcome> => {
    const { data, error: queryError } = await filesDb(supabase)
      .from("files")
      .select(FILES_TABLE_COLUMNS)
      .eq("id", fileId)
      .is("deleted_at", null)
      .maybeSingle();

    if (queryError) {
      console.error(
        "[files] useEnsureCloudFile FAILED to fetch file (RLS/permission or DB error, NOT a real 'not found'):",
        fileId,
        queryError,
      );
      return { kind: "error", message: queryError.message };
    }
    if (!data) return { kind: "missing" };
    return { kind: "ready", row: data as CloudFileReadRow };
  })().finally(() => {
    inflightById.delete(fileId);
  });

  inflightById.set(fileId, promise);
  return promise;
}

export function useEnsureCloudFile(
  fileId: string | null | undefined,
): EnsureCloudFileResult {
  const dispatch = useAppDispatch();
  const existing = useAppSelector((s) =>
    fileId ? selectFileById(s, fileId) : undefined,
  );
  const [status, setStatus] = useState<EnsureCloudFileStatus>(() =>
    !fileId || isSyntheticId(fileId) ? "idle" : existing ? "ready" : "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId || isSyntheticId(fileId)) {
      setStatus("idle");
      setError(null);
      return undefined;
    }
    if (existing) {
      setStatus("ready");
      setError(null);
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);

    void (async () => {
      const outcome = await fetchFileRow(fileId);
      if (cancelled) return;

      if (outcome.kind === "error") {
        setStatus("error");
        setError(outcome.message);
        return;
      }
      if (outcome.kind === "missing") {
        setStatus("missing");
        setError(null);
        return;
      }

      dispatch(upsertFile(dbRowToCloudFile(outcome.row)));
      setStatus("ready");
      setError(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, existing, dispatch]);

  return { status, error };
}
