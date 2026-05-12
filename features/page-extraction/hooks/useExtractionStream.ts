/**
 * features/page-extraction/hooks/useExtractionStream.ts
 *
 * Drives an in-flight Run from the UI:
 *   - opens the NDJSON SSE stream
 *   - dispatches lifecycle events into the pageExtractionSlice so the
 *     progress bar reacts immediately (before the Realtime Insert lands)
 *   - hands back an AbortController so the caller can cancel
 *
 * Realtime is responsible for keeping Results in sync after the user
 * navigates away. The stream is purely for the active component.
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { runExtractionStream } from "@/features/page-extraction/api/stream";
import {
  pageRunCompleted,
  pageRunFailed,
  pageRunStarted,
  runCompleted,
  runFailed,
  runStarted,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import type { RunExtractionRequest } from "@/features/page-extraction/types";

export interface UseExtractionStreamResult {
  running: boolean;
  error: string | null;
  start: (
    fileId: string,
    body: RunExtractionRequest,
  ) => Promise<{ runId: string | null }>;
  abort: () => void;
}

export function useExtractionStream(): UseExtractionStreamResult {
  const dispatch = useAppDispatch();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, []);

  const start = useCallback<UseExtractionStreamResult["start"]>(
    async (fileId, body) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setError(null);
      setRunning(true);

      let runId: string | null = null;
      try {
        for await (const evt of runExtractionStream(body, { signal: ac.signal })) {
          switch (evt.event) {
            case "run.started":
              runId = evt.data.run_id;
              dispatch(
                runStarted({
                  runId: evt.data.run_id,
                  jobId: body.job_id,
                  fileId,
                  chunkCount: evt.data.chunk_count,
                }),
              );
              break;
            case "page_run.started":
              dispatch(
                pageRunStarted({
                  jobId: body.job_id,
                  pageRunId: evt.data.page_run_id,
                  chunkIndex: evt.data.chunk_index,
                  pageNumbers: evt.data.page_numbers,
                }),
              );
              break;
            case "page_run.completed":
              dispatch(
                pageRunCompleted({
                  jobId: body.job_id,
                  pageRunId: evt.data.page_run_id,
                  chunkIndex: evt.data.chunk_index,
                  pageNumbers: evt.data.page_numbers,
                  resultCount: evt.data.result_count,
                  cost: evt.data.cost,
                  tokens: evt.data.tokens,
                  durationMs: evt.data.duration_ms,
                }),
              );
              break;
            case "page_run.failed":
              dispatch(
                pageRunFailed({
                  jobId: body.job_id,
                  pageRunId: evt.data.page_run_id,
                  chunkIndex: evt.data.chunk_index,
                  pageNumbers: evt.data.page_numbers,
                  error: evt.data.error,
                }),
              );
              break;
            case "run.completed":
              dispatch(
                runCompleted({
                  jobId: body.job_id,
                  runId: evt.data.run_id,
                  resultCount: evt.data.result_count,
                  completedChunks: evt.data.completed_chunks,
                  failedChunks: evt.data.failed_chunks,
                  totalCost: evt.data.total_cost,
                  totalTokens: evt.data.total_tokens,
                }),
              );
              break;
            case "run.failed":
              dispatch(
                runFailed({
                  jobId: body.job_id,
                  runId: evt.data.run_id,
                  error: evt.data.error,
                }),
              );
              setError(evt.data.error);
              break;
            case "stream.error":
              setError(evt.data.message);
              break;
          }
        }
      } catch (err) {
        if (!ac.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setRunning(false);
      }
      return { runId };
    },
    [dispatch],
  );

  return { running, error, start, abort };
}
