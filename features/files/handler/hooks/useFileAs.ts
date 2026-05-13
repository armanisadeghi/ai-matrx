/**
 * features/files/handler/hooks/useFileAs.ts
 *
 * Resolve a source AND render it for a specific consumer in one step.
 * Returns the rendered shape directly — most components use this rather
 * than the lower-level `useFile()`.
 *
 * Specialized convenience wrappers (`useFileSrc`, `useFileBlob`, etc.)
 * just call this with a fixed target.
 */

"use client";

import { useEffect, useState } from "react";
import { fileHandler } from "../handler";
import type { FileSource, FileTarget, RenderedFor } from "../types";

export interface UseFileAsResult<T extends FileTarget> {
  result: RenderedFor<T> | null;
  status: "idle" | "resolving" | "ready" | "error";
  error: Error | null;
}

export function useFileAs<T extends FileTarget>(
  source: FileSource | null | undefined,
  target: T,
): UseFileAsResult<T> {
  const [result, setResult] = useState<RenderedFor<T> | null>(null);
  const [status, setStatus] = useState<"idle" | "resolving" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState<Error | null>(null);

  const targetKey = JSON.stringify(target);

  useEffect(() => {
    if (!source) {
      setResult(null);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("resolving");
    setError(null);
    fileHandler
      .use(source)
      .as(target)
      .then((value) => {
        if (cancelled) return;
        setResult(value as RenderedFor<T>);
        setStatus("ready");
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
  }, [stableSourceKey(source), targetKey]);

  return { result, status, error };
}

function stableSourceKey(source: FileSource | null | undefined): string {
  if (!source) return "<none>";
  if ("fileId" in source && source.fileId) return `id:${source.fileId}`;
  if ("cloudFile" in source) return `cf:${source.cloudFile.id}`;
  if ("url" in source && source.url) return `url:${source.url}`;
  if ("token" in source) return `t:${source.token}`;
  if ("file" in source) return `file:${source.file.name}:${source.file.size}`;
  return source.kind;
}
