/**
 * features/page-extraction/hooks/usePersistedRunHydration.ts
 *
 * Rehydrates the latest run's per-chunk state from the database into the
 * `pageExtraction` slice on mount / page reload.
 *
 * Why this exists: the per-chunk run data (raw_response, parsed_payload,
 * status, source page numbers) lives in `page_extraction_page_runs` and is
 * durably persisted — but `usePageRunsRealtime` only mirrors *live* updates
 * into Redux. After a full page reload the in-memory `activeRuns` map is
 * empty, so the Chunks tab loses its per-chunk "Agent output" overlay even
 * though the data is safe in the DB. This hook closes that gap: it loads the
 * persisted page_runs for the viewed job's latest run and replays them through
 * the same slice actions the stream uses, so the UI converges to the exact
 * state it showed live — the connection between each extracted row and the
 * source pages the agent saw is restored, not lost.
 *
 * It deliberately does NOT clobber a live run: if `activeRuns[jobId]` already
 * exists (a run started this session, or an earlier hydration), it no-ops.
 */

"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  getLatestRunId,
  getRun,
  listPageRunsForRun,
} from "@/features/page-extraction/api/runs";
import {
  isAllJobsView,
  pageRunCompleted,
  pageRunFailed,
  pageRunStarted,
  runCompleted,
  runStarted,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import { selectActiveRunByJob } from "@/features/page-extraction/redux/selectors";

export function usePersistedRunHydration(opts: {
  fileId: string | null;
  jobId: string | null;
}): void {
  const { fileId, jobId } = opts;
  const dispatch = useAppDispatch();
  // The All-view sentinel isn't a real job — nothing to hydrate.
  const effectiveJobId = isAllJobsView(jobId) ? null : jobId;
  // Skip hydration when a run for this job is already in memory (live or
  // previously hydrated). We only fill the gap left by a reset store.
  const hasActiveRun = useAppSelector(
    (s) => !!selectActiveRunByJob(s, effectiveJobId),
  );
  // Guard so we hydrate a given (job, run) pair exactly once even across
  // re-renders / strict-mode double-invocation.
  const hydratedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!fileId || !effectiveJobId || hasActiveRun) return undefined;
    let cancelled = false;

    void (async () => {
      try {
        const runId = await getLatestRunId(effectiveJobId);
        if (cancelled || !runId) return;
        const key = `${effectiveJobId}:${runId}`;
        if (hydratedRef.current.has(key)) return;

        const [run, pageRuns] = await Promise.all([
          getRun(runId),
          listPageRunsForRun(runId),
        ]);
        if (cancelled || pageRuns.length === 0) return;
        hydratedRef.current.add(key);

        dispatch(
          runStarted({
            runId,
            jobId: effectiveJobId,
            fileId,
            chunkCount: pageRuns.length,
          }),
        );

        let completed = 0;
        let failed = 0;
        let resultCount = 0;
        let totalCost = 0;
        let totalTokens = 0;

        for (const pr of pageRuns) {
          const pageNumbers = Array.isArray(pr.page_numbers)
            ? pr.page_numbers
            : [];
          if (pr.status === "failed") {
            failed += 1;
            dispatch(
              pageRunFailed({
                jobId: effectiveJobId,
                pageRunId: pr.id,
                chunkIndex: pr.chunk_index,
                pageNumbers,
                error: pr.error ?? pr.parse_error ?? "Failed",
                rawResponse: pr.raw_response ?? undefined,
              }),
            );
          } else if (pr.status === "completed") {
            const parsed = Array.isArray(pr.parsed_payload)
              ? (pr.parsed_payload as Record<string, unknown>[])
              : null;
            const rc = parsed?.length ?? 0;
            completed += 1;
            resultCount += rc;
            totalCost += Number(pr.cost ?? 0);
            totalTokens += Number(pr.tokens ?? 0);
            dispatch(
              pageRunCompleted({
                jobId: effectiveJobId,
                pageRunId: pr.id,
                chunkIndex: pr.chunk_index,
                pageNumbers,
                resultCount: rc,
                cost: Number(pr.cost ?? 0),
                tokens: Number(pr.tokens ?? 0),
                durationMs: Number(pr.duration_ms ?? 0),
                rawResponse: pr.raw_response ?? "",
                parsedPayload: parsed,
              }),
            );
          } else {
            // pending / running — show it as in-flight (a real live run
            // would then take over via usePageRunsRealtime).
            dispatch(
              pageRunStarted({
                jobId: effectiveJobId,
                pageRunId: pr.id,
                chunkIndex: pr.chunk_index,
                pageNumbers,
              }),
            );
          }
        }

        // Only mark the run terminal when every chunk is terminal — otherwise
        // leave it "running" so a resumed live run can finish it.
        const allTerminal = pageRuns.every(
          (pr) => pr.status === "completed" || pr.status === "failed",
        );
        if (allTerminal) {
          dispatch(
            runCompleted({
              jobId: effectiveJobId,
              runId,
              resultCount,
              completedChunks: completed,
              failedChunks: failed,
              totalCost: Number(run?.total_cost ?? totalCost),
              totalTokens: Number(run?.total_tokens ?? totalTokens),
            }),
          );
        }
      } catch {
        // Hydration is best-effort: a failure here just means the Chunks tab
        // shows the input preview without the run overlay until the user
        // re-runs. It must never break the pane.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, effectiveJobId, hasActiveRun, dispatch]);
}
