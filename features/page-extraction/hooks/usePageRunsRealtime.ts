/**
 * features/page-extraction/hooks/usePageRunsRealtime.ts
 *
 * Mirror page_extraction_page_runs row state into the active-run slice via
 * Supabase Realtime. This is the durable counterpart to the SSE stream:
 *
 *   - SSE provides low-latency token deltas and "completed" events
 *   - Realtime catches the final raw_response / parsed_payload even if
 *     the SSE connection drops or the user navigates away mid-run
 *
 * On UPDATE events for any page_run belonging to the active job, we
 * dispatch the same `pageRunCompleted` / `pageRunFailed` actions the
 * stream uses, so the UI converges to the same state regardless of
 * which channel won the race.
 */

"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  isAllJobsView,
  pageRunCompleted,
  pageRunFailed,
  pageRunStarted,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import { selectActiveRunByJob } from "@/features/page-extraction/redux/selectors";

interface PageRunRow {
  id: string;
  run_id: string;
  job_id: string;
  chunk_index: number;
  page_numbers: number[];
  status: string;
  raw_response: string | null;
  parsed_payload: Record<string, unknown>[] | null;
  parse_error: string | null;
  error: string | null;
  cost: number | null;
  tokens: number | null;
  duration_ms: number | null;
}

export function usePageRunsRealtime(opts: {
  fileId: string | null;
  jobId: string | null;
}): void {
  const { fileId, jobId } = opts;
  // In the All-view the jobId is the sentinel — there's no single
  // job-run to mirror. The cross-template results table subscribes
  // directly to `page_extraction_results` by file_id, so dropping
  // this subscription here doesn't lose any live updates.
  const isAll = isAllJobsView(jobId);
  const effectiveJobId = isAll ? null : jobId;
  const dispatch = useAppDispatch();
  const activeRun = useAppSelector((s) =>
    selectActiveRunByJob(s, effectiveJobId),
  );
  const activeRunId = activeRun?.runId ?? null;

  useEffect(() => {
    if (!fileId || !effectiveJobId || !activeRunId) return undefined;
    const supabase = createClient();
    const channel = supabase
      .channel(`page-runs-rt:${activeRunId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "page_extraction_page_runs",
          filter: `run_id=eq.${activeRunId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as PageRunRow | undefined;
          if (!row) return;
          // Don't reprocess INSERTs for chunks we already saw via SSE
          // (the slice's pageRunStarted is idempotent — passing the same
          // page_run_id replaces the entry with the same shape).
          if (payload.eventType === "INSERT" || row.status === "running") {
            dispatch(
              pageRunStarted({
                jobId: effectiveJobId,
                pageRunId: row.id,
                chunkIndex: row.chunk_index,
                pageNumbers: row.page_numbers,
              }),
            );
            return;
          }
          if (row.status === "completed") {
            dispatch(
              pageRunCompleted({
                jobId: effectiveJobId,
                pageRunId: row.id,
                chunkIndex: row.chunk_index,
                pageNumbers: row.page_numbers,
                resultCount: 0, // result count comes from results-table subscription
                cost: Number(row.cost ?? 0),
                tokens: Number(row.tokens ?? 0),
                durationMs: Number(row.duration_ms ?? 0),
                rawResponse: row.raw_response ?? "",
                parsedPayload: row.parsed_payload,
              }),
            );
            return;
          }
          if (row.status === "failed") {
            dispatch(
              pageRunFailed({
                jobId: effectiveJobId,
                pageRunId: row.id,
                chunkIndex: row.chunk_index,
                pageNumbers: row.page_numbers,
                error: row.error ?? row.parse_error ?? "Failed",
                rawResponse: row.raw_response ?? undefined,
              }),
            );
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fileId, effectiveJobId, activeRunId, dispatch]);
}
