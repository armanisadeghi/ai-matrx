/**
 * features/rag/hooks/useFileIngest.ts
 *
 * One-call entry point for "process this file for Knowledge" from any
 * cloud-files surface. Uses the streaming endpoint by default so the
 * UI can render per-stage progress (extract / chunk / embed / upsert),
 * but exposes a `runOnce` non-streaming fallback for callers that
 * just want a fire-and-forget toast.
 *
 * On success we
 *   1. invalidate the document lookup cache for this fileId so the
 *      next `useFileDocument()` reads the fresh state, and
 *   2. dispatch a custom event the PreviewPane listens for to refresh
 *      its Document tab without a full reload.
 *
 * Errors surface as a `error` field; the caller decides whether to
 * toast or render inline.
 */

"use client";

import { useCallback, useRef, useState } from "react";
import {
  ingestFile,
  ingestFileStream,
  type IngestProgress,
  type IngestResponse,
} from "@/features/rag/api/ingest";
import { clearFileDocumentCache } from "@/features/files/api/document-lookup";

export type IngestStatus = "idle" | "running" | "complete" | "error";

export interface UseFileIngestState {
  status: IngestStatus;
  progress: IngestProgress | null;
  result: IngestResponse | null;
  error: string | null;
}

const INITIAL: UseFileIngestState = {
  status: "idle",
  progress: null,
  result: null,
  error: null,
};

const PROCESSED_EVENT = "cloud-files:document-processed";

/** Fire after a successful ingest so PreviewPane can refresh. */
function emitProcessed(fileId: string): void {
  window.dispatchEvent(
    new CustomEvent(PROCESSED_EVENT, { detail: { fileId } }),
  );
}

export function useFileIngest(fileId: string | null) {
  const [state, setState] = useState<UseFileIngestState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => setState(INITIAL), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, status: "idle" }));
  }, []);

  /** Streaming run — recommended for visible UI. */
  const run = useCallback(
    async (opts: { force?: boolean } = {}) => {
      if (!fileId) return;
      // Cancel any prior in-flight stream for this hook instance.
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setState({
        status: "running",
        progress: null,
        result: null,
        error: null,
      });

      try {
        for await (const evt of ingestFileStream(fileId, {
          force: opts.force,
          signal: ac.signal,
        })) {
          if (evt.event === "rag.ingest.progress") {
            setState((s) => ({ ...s, progress: evt.data }));
          } else if (evt.event === "rag.ingest.complete") {
            setState({
              status: "complete",
              progress: null,
              result: evt.data,
              error: evt.data.error ?? null,
            });
            clearFileDocumentCache(fileId);
            emitProcessed(fileId);
            return;
          } else if (evt.event === "rag.ingest.error") {
            setState({
              status: "error",
              progress: null,
              result: null,
              error: evt.data.message,
            });
            return;
          }
        }
      } catch (err) {
        if (ac.signal.aborted) return;
        setState({
          status: "error",
          progress: null,
          result: null,
          error: err instanceof Error ? err.message : "Ingest failed",
        });
      }
    },
    [fileId],
  );

  /** Non-streaming run — single round-trip; no progress UI. */
  const runOnce = useCallback(
    async (opts: { force?: boolean } = {}) => {
      if (!fileId) return;
      setState({
        status: "running",
        progress: null,
        result: null,
        error: null,
      });
      try {
        const result = await ingestFile(fileId, opts);
        setState({
          status: "complete",
          progress: null,
          result,
          error: result.error,
        });
        clearFileDocumentCache(fileId);
        emitProcessed(fileId);
      } catch (err) {
        setState({
          status: "error",
          progress: null,
          result: null,
          error: err instanceof Error ? err.message : "Ingest failed",
        });
      }
    },
    [fileId],
  );

  return { ...state, run, runOnce, cancel, reset };
}

/** Subscribe to the cross-component "document processed" event. */
export function onFileDocumentProcessed(
  handler: (fileId: string) => void,
): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ fileId?: string }>).detail;
    if (detail?.fileId) handler(detail.fileId);
  };
  window.addEventListener(PROCESSED_EVENT, listener);
  return () => window.removeEventListener(PROCESSED_EVENT, listener);
}
