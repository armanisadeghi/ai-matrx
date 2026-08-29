"use client";

/**
 * Ensure a durable file id has the fields a consuming surface requires.
 *
 * Redux `_loadedFields` is authoritative. Known message/API hints merge first;
 * the shared thunk then fetches only the missing field set and deduplicates
 * concurrent consumers. A loaded null is complete and never refetched.
 */

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { isSyntheticId } from "@/features/files/virtual-sources/path";
import {
  ensureCloudFileFields,
  type EnsureCloudFileFieldsOutcome,
} from "@/features/files/redux/thunks";
import {
  areCloudFileFieldsLoaded,
  FILE_DB_RECORD_FIELDS,
  type CloudFileHydrationField,
} from "@/features/files/redux/file-hydration";
import type { FileIdentityHint } from "@/features/files/types";

export type EnsureCloudFileStatus =
  "idle" | "ready" | "loading" | "missing" | "error";

export interface EnsureCloudFileResult {
  status: EnsureCloudFileStatus;
  error: string | null;
  /** Raw read error for `<AccessGate error={…}/>` consumers. */
  readError: unknown;
  retry: () => void;
}

export interface EnsureCloudFileOptions {
  fields?: readonly CloudFileHydrationField[];
  hint?: FileIdentityHint;
}

export function useEnsureCloudFile(
  fileId: string | null | undefined,
  options: EnsureCloudFileOptions = {},
): EnsureCloudFileResult {
  const dispatch = useAppDispatch();
  const fields = options.fields ?? FILE_DB_RECORD_FIELDS;
  const hint = options.hint;
  const existing = useAppSelector((state) =>
    fileId ? selectFileById(state, fileId) : undefined,
  );
  const ready = areCloudFileFieldsLoaded(existing, fields);
  const [status, setStatus] = useState<EnsureCloudFileStatus>(() =>
    !fileId || isSyntheticId(fileId) ? "idle" : ready ? "ready" : "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!fileId || isSyntheticId(fileId)) {
      setStatus("idle");
      setError(null);
      setReadError(null);
      return undefined;
    }
    if (ready) {
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
      try {
        const outcome: EnsureCloudFileFieldsOutcome = await dispatch(
          ensureCloudFileFields({ fileId, fields, hint }),
        ).unwrap();
        if (cancelled) return;
        setStatus(outcome);
        setError(null);
        setReadError(null);
      } catch (requestError) {
        if (cancelled) return;
        const message =
          requestError instanceof Error
            ? requestError.message
            : "The file metadata could not be loaded.";
        console.error(
          "[files] useEnsureCloudFile: the file row could not be read:",
          fileId,
          requestError,
        );
        setStatus("error");
        setError(message);
        setReadError(requestError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, dispatch, fields, fileId, hint, ready]);

  return { status, error, readError, retry };
}
