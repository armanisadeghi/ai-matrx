/**
 * features/page-extraction/hooks/useExtractionResults.ts
 *
 * Live results for a Job (defaults to its latest run). Subscribes to
 * `page_extraction_results` Realtime INSERTs so new rows appear in the
 * table mid-run without consuming the SSE stream — that's the resilience
 * pattern documented in FEATURE.md.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getLatestRunId, listResults } from "@/features/page-extraction/api/runs";
import type { PageExtractionResult } from "@/features/page-extraction/types";

export interface UseExtractionResultsOptions {
  /** Scope to this run instead of the job's latest. */
  runId?: string | null;
  /** Filter to results that reference this 1-based page number. */
  pageNumber?: number | null;
}

export interface UseExtractionResultsResult {
  results: PageExtractionResult[];
  runId: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useExtractionResults(
  jobId: string | null,
  opts: UseExtractionResultsOptions = {},
): UseExtractionResultsResult {
  const [results, setResults] = useState<PageExtractionResult[]>([]);
  const [runId, setRunId] = useState<string | null>(opts.runId ?? null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  // Resolve which run we're showing.
  useEffect(() => {
    if (!jobId) {
      setRunId(null);
      return;
    }
    if (opts.runId) {
      setRunId(opts.runId);
      return;
    }
    let cancelled = false;
    void getLatestRunId(jobId)
      .then((id) => {
        if (!cancelled) setRunId(id);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, opts.runId, refetchTick]);

  // Load results once we know the run.
  useEffect(() => {
    if (!jobId) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listResults({ jobId, runId })
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
  }, [jobId, runId, refetchTick]);

  // Realtime INSERT subscription.
  useEffect(() => {
    if (!jobId) return;
    const supabase = createClient();
    const filter = runId
      ? `run_id=eq.${runId}`
      : `job_id=eq.${jobId}`;
    const channel = supabase
      .channel(`page-extraction-results:${jobId}:${runId ?? "all"}`)
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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [jobId, runId]);

  const filtered = useMemo(() => {
    if (!opts.pageNumber) return results;
    return results.filter((r) =>
      Array.isArray(r.source_pages) &&
      r.source_pages.includes(opts.pageNumber as number),
    );
  }, [results, opts.pageNumber]);

  return {
    results: filtered,
    runId,
    loading,
    error,
    refetch: () => setRefetchTick((n) => n + 1),
  };
}
