/**
 * features/files/handler/hooks/useFile.ts
 *
 * Resolve a `FileSource` to a `NormalizedFile`. Re-runs when the source's
 * identity changes (its `kind` plus the relevant identifier — fileId, url,
 * token, blob ref). The returned object is stable across renders that
 * don't change those identifiers.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { fileHandler } from "../handler";
import { unwatchExpiry } from "../intelligence/expiry-wheel";
import type { FileSource, NormalizedFile } from "../types";

export type FileStatus = "idle" | "resolving" | "ready" | "error";

export interface UseFileResult {
  file: NormalizedFile | null;
  status: FileStatus;
  error: Error | null;
  reload: () => void;
}

export function useFile(source: FileSource | null | undefined): UseFileResult {
  const [file, setFile] = useState<NormalizedFile | null>(null);
  const [status, setStatus] = useState<FileStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const lastFileIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!source) {
      setFile(null);
      setStatus("idle");
      setError(null);
      return;
    }

    let cancelled = false;
    setStatus("resolving");
    setError(null);

    fileHandler
      .resolve(source)
      .then((resolved) => {
        if (cancelled) return;
        setFile(resolved);
        setStatus("ready");
        lastFileIdRef.current = resolved.fileId ?? null;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey(source), tick]);

  useEffect(() => {
    return () => {
      const prev = lastFileIdRef.current;
      if (prev) unwatchExpiry(prev);
    };
  }, []);

  return {
    file,
    status,
    error,
    reload: () => setTick((t) => t + 1),
  };
}

/**
 * Stable identity key for a FileSource. Different shapes have different
 * meaningful identifiers — this collapses each into one string so React
 * effects re-run only when the source actually changes.
 */
function sourceKey(source: FileSource | null | undefined): string {
  if (!source) return "<none>";
  switch (source.kind) {
    case "blob":
      return `blob:${source.blob.size}:${source.fileName ?? ""}`;
    case "file":
      return `file:${source.file.name}:${source.file.size}:${source.file.lastModified}`;
    case "buffer":
      return `buffer:${source.fileName ?? ""}:${source.mime}`;
    case "stream":
      return `stream:${source.fileName ?? ""}`;
    case "data_uri":
      return `data:${source.dataUri.slice(0, 64)}`;
    case "base64":
      return `b64:${source.mime}:${source.base64.slice(0, 32)}`;
    case "external_url":
      return `ext:${source.url}`;
    case "youtube":
      return `yt:${source.url}`;
    case "cloud_file":
      return `cf:${source.cloudFile.id}`;
    case "file_id":
      return `id:${source.fileId}`;
    case "file_uri":
      return `uri:${source.fileUri}`;
    case "signed_url":
      return `signed:${source.fileId ?? source.url}`;
    case "share_link":
      return `share:${source.token}`;
    case "public_cdn":
      return `cdn:${source.fileId ?? source.url}`;
    case "upload_result":
      return `up:${source.uploadResult.fileId ?? source.uploadResult.url}`;
    case "stream_event":
      return `ev:${JSON.stringify(source.payload).slice(0, 64)}`;
  }
}
