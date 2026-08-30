/**
 * features/page-extraction/hooks/useExtractionResults.ts
 *
 * Live results for a Job. Returns EVERY result row for the template by
 * default — across all runs. Callers can scope to a specific run via
 * `opts.runId` when they want "the latest extraction only."
 *
 * Subscribes to `page_extraction_results` Realtime INSERTs so new rows
 * appear in the table mid-run without consuming the SSE stream. The
 * resilience pattern lets the UI converge whether the SSE event or the
 * Realtime event wins the race.
 *
 * NB: the old version filtered by `latest_run_id` and hid every row from
 *     prior runs. With re-runs producing new run records, the user saw
 *     only the most recent execution's results — confusing when an
 *     earlier run had real data and the latest one returned `[]`.
 *     Overwrite-on-overlap (delete prior results for re-extracted pages)
 *     is a server-side concern that lives in the run pipeline, NOT in
 *     this read hook.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useAsyncData, useRealtimeChannel } from "@ai-matrx/data/react";
import { supabase } from "@/utils/supabase/client";
import { listResults } from "@/features/page-extraction/api/runs";
import type { PageExtractionResult } from "@/features/page-extraction/types";

export interface UseExtractionResultsOptions {
  /** Scope to a single run instead of every run for the Job. */
  runId?: string | null;
  /** Optional: filter to results that reference this 1-based page number.
   *  Off by default — the ExtractionsPane no longer auto-passes activePage
   *  because that hides every row whenever the user isn't on a page that
   *  has extractions. */
  pageNumber?: number | null;
}

export interface UseExtractionResultsResult {
  results: PageExtractionResult[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useExtractionResults(
  jobId: string | null,
  opts: UseExtractionResultsOptions = {},
): UseExtractionResultsResult {
  const runId = opts.runId ?? null;

  // Cancellation, stale-response ordering, honest error conversion and retry
  // of transport failures live in @ai-matrx/data/react. (The old hand-wired
  // version did `setError(String(err))`, which renders a PostgREST error —
  // a plain object, not an Error — as "[object Object]".)
  const query = useAsyncData(
    () => listResults({ jobId: jobId as string, runId }),
    [jobId, runId],
    { enabled: jobId !== null },
  );

  // Rows arrive incrementally and are merged in place rather than refetched:
  // a 200-page extraction would otherwise re-read the whole result set per
  // event. The subscription's reconnect/teardown hygiene is the package's;
  // the merge is this feature's domain logic.
  const [live, setLive] = useState<PageExtractionResult[]>([]);
  useEffect(() => setLive([]), [jobId, runId, query.data]);

  const filter = runId ? `run_id=eq.${runId}` : `job_id=eq.${jobId ?? ""}`;
  const bindings = useMemo(
    () => [
      {
        event: "INSERT" as const,
        schema: "docproc",
        table: "page_extraction_results",
        filter,
        onChange: (payload: { new?: unknown }) => {
          const row = payload.new as PageExtractionResult;
          setLive((prev) =>
            prev.some((r) => r.id === row.id) ? prev : [...prev, row],
          );
        },
      },
      {
        event: "UPDATE" as const,
        schema: "docproc",
        table: "page_extraction_results",
        filter,
        onChange: (payload: { new?: unknown }) => {
          const row = payload.new as PageExtractionResult;
          setLive((prev) =>
            prev.some((r) => r.id === row.id)
              ? prev.map((r) => (r.id === row.id ? row : r))
              : [...prev, row],
          );
        },
      },
    ],
    [filter],
  );

  useRealtimeChannel(
    supabase,
    `page-extraction-results:${jobId ?? "none"}:${runId ?? "all"}`,
    bindings,
    {
      enabled: jobId !== null,
      // Rows written while the socket was down never arrive as events; the
      // re-read is the only way back to a complete list.
      onReconnect: query.refresh,
    },
  );

  const results = useMemo(() => {
    const merged = [...(query.data ?? [])];
    for (const row of live) {
      const at = merged.findIndex((r) => r.id === row.id);
      if (at === -1) merged.push(row);
      else merged[at] = row;
    }
    return merged.sort((a, b) => {
      const ap = a.canonical_page ?? Number.MAX_SAFE_INTEGER;
      const bp = b.canonical_page ?? Number.MAX_SAFE_INTEGER;
      if (ap !== bp) return ap - bp;
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }, [query.data, live]);

  const filtered = useMemo(() => {
    if (!opts.pageNumber) return results;
    return results.filter(
      (r) =>
        Array.isArray(r.source_pages) &&
        r.source_pages.includes(opts.pageNumber as number),
    );
  }, [results, opts.pageNumber]);

  return {
    results: filtered,
    loading: query.loading,
    error: query.error?.message ?? null,
    refetch: query.refresh,
  };
}
