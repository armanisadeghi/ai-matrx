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
import { createClient } from "@/utils/supabase/client";
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
  const [results, setResults] = useState<PageExtractionResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  // Load results for the job (optionally narrowed to a specific run).
  useEffect(() => {
    if (!jobId) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listResults({ jobId, runId: opts.runId ?? null })
      .then((rows) => {
        if (!cancelled) {
          setResults(rows);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, opts.runId, refetchTick]);

  // Realtime subscription — INSERT (new extraction rows) AND UPDATE
  // (a validation pass writing is_duplicate / canonical_entry / other
  // validation columns back onto existing rows). Scope to the job.
  useEffect(() => {
    if (!jobId) return;
    const supabase = createClient();
    const filter = opts.runId
      ? `run_id=eq.${opts.runId}`
      : `job_id=eq.${jobId}`;
    const channel = supabase
      .channel(`page-extraction-results:${jobId}:${opts.runId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "page_extraction_results",
          filter,
        },
        (payload) => {
          const row = payload.new as PageExtractionResult;
          setResults((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            return [...prev, row].sort((a, b) => {
              const ap = a.canonical_page ?? Number.MAX_SAFE_INTEGER;
              const bp = b.canonical_page ?? Number.MAX_SAFE_INTEGER;
              if (ap !== bp) return ap - bp;
              return (
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime()
              );
            });
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "page_extraction_results",
          filter,
        },
        (payload) => {
          const row = payload.new as PageExtractionResult;
          setResults((prev) =>
            prev.map((r) => (r.id === row.id ? row : r)),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [jobId, opts.runId]);

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
    loading,
    error,
    refetch: () => setRefetchTick((n) => n + 1),
  };
}
