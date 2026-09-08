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
 *
 * REALTIME: `@ai-matrx/realtime` owns the channel (`useChannel`). What was here
 * was a raw `.channel(...).subscribe()` with manual teardown and NO catch-up
 * read — which defeated the very purpose of this hook: it exists to be the
 * durable counterpart that survives an SSE drop, and a socket that dropped
 * with it left the run frozen mid-progress forever. `onBackfill` re-reads every
 * page_run of the active run through `listPageRunsForRun` and replays them
 * through the same reducer path, so a recovery converges to the same state.
 */

"use client";

import { useCallback } from "react";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useChannel } from "@ai-matrx/realtime/react";
import { listPageRunsForRun } from "@/features/page-extraction/api/runs";
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

/** One place names this channel. A second, different declaration throws. */
const pageRunsChannel = defineChannelNamespace({
  namespace: "page-runs",
  parts: ["runId"],
  description: "docproc.page_extraction_page_runs rows for one active run",
});

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

  /**
   * Fold one page_run row into the slice. Shared by the live path and the
   * catch-up read, so a recovered run converges to exactly the same state the
   * events would have produced.
   */
  const applyRow = useCallback(
    (row: PageRunRow | null | undefined, isInsert: boolean) => {
      if (!row || !effectiveJobId) return;
      // Don't reprocess INSERTs for chunks we already saw via SSE
      // (the slice's pageRunStarted is idempotent — passing the same
      // page_run_id replaces the entry with the same shape).
      if (isInsert || row.status === "running") {
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
    [dispatch, effectiveJobId],
  );

  useChannel(
    fileId && effectiveJobId && activeRunId
      ? {
          topic: pageRunsChannel.topic({ runId: activeRunId }),
          postgresChanges: [
            {
              event: "*",
              schema: "docproc",
              table: "page_extraction_page_runs",
              filter: `run_id=eq.${activeRunId}`,
              rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
              fingerprint: (row) => String(row.status ?? ""),
              onChange: ({ payload, row }) => {
                applyRow(
                  (row ?? payload.old) as PageRunRow | undefined,
                  payload.eventType === "INSERT",
                );
              },
            },
          ],
          // Realtime has no replay, and this hook IS the durability story for a
          // dropped SSE stream — a gap here freezes the run's progress on
          // screen with nothing to say so. Re-read every page_run of the run.
          onBackfill: async () => {
            try {
              const rows = await listPageRunsForRun(activeRunId);
              for (const row of rows) {
                applyRow(row as unknown as PageRunRow, false);
              }
            } catch (error) {
              console.warn(
                "[page-runs RT] catch-up read failed — this run's progress may " +
                  "be stale on screen until the next event or a reload.",
                error,
              );
            }
          },
        }
      : null,
  );
}
