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

import { useCallback, useEffect, useState } from "react";
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
  /**
   * The raw read error, for `<AccessGate error={…}/>`. A `missing` outcome
   * carries `null` — a zero-row read produces no error at all, and that is
   * exactly the silent-RLS case the gate is built to resolve.
   */
  readError: unknown;
  /** Drop the cached round-trip and read the row again. */
  retry: () => void;
}

type FetchOutcome =
  | { kind: "ready"; row: CloudFileReadRow }
  | { kind: "missing" }
  | { kind: "error"; message: string; error: unknown };

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
      // The read itself failed (a DB error or a policy that spoke up). It is
      // NOT evidence that the file is gone — callers must render the access
      // gate, never a "deleted" sentence. The raw PostgREST detail is already
      // captured by the client-wide proxy; this line keeps the file id beside
      // it in the console for local debugging.
      console.error(
        "[files] useEnsureCloudFile: the file row could not be read:",
        fileId,
        queryError,
      );
      return { kind: "error", message: queryError.message, error: queryError };
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
  const [readError, setReadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  // A retry must re-hit the network: the in-flight map is keyed by file id and
  // a settled entry is already deleted, so bumping `attempt` re-runs the read.
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!fileId || isSyntheticId(fileId)) {
      setStatus("idle");
      setError(null);
      setReadError(null);
      return undefined;
    }
    if (existing) {
      setStatus("ready");
      setError(null);
      setReadError(null);
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);
    setReadError(null);

    void (async () => {
      const outcome = await fetchFileRow(fileId);
      if (cancelled) return;

      if (outcome.kind === "error") {
        setStatus("error");
        setError(outcome.message);
        setReadError(outcome.error);
        return;
      }
      if (outcome.kind === "missing") {
        setStatus("missing");
        setError(null);
        setReadError(null);
        return;
      }

      dispatch(upsertFile(dbRowToCloudFile(outcome.row)));
      setStatus("ready");
      setError(null);
      setReadError(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, existing, dispatch, attempt]);

  return { status, error, readError, retry };
}
