/**
 * features/page-extraction/hooks/useExtractionResultsForFile.ts
 *
 * Cross-template results feed for a file — the data behind the "All
 * extractions" view in the main extractions pane. Returns every
 * `page_extraction_results` row for the given fileId, regardless of
 * which template (job) produced it, and subscribes to Realtime INSERTs
 * scoped by `file_id=eq.${fileId}` so new rows from any concurrent run
 * land in the table mid-flight.
 *
 * Mirrors the shape of `useExtractionResults` (single-job version) so
 * callers can swap based on `isAllJobsView(viewedJobId)`.
 */

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { listResultsForFile } from "@/features/page-extraction/api/runs";
import type { PageExtractionResult } from "@/features/page-extraction/types";

export interface UseExtractionResultsForFileResult {
  results: PageExtractionResult[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useExtractionResultsForFile(
  fileId: string | null,
): UseExtractionResultsForFileResult {
  const [results, setResults] = useState<PageExtractionResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    if (!fileId) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    void listResultsForFile(fileId)
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
  }, [fileId, refetchTick]);

  useEffect(() => {
    if (!fileId) return undefined;
    const supabase = createClient();
    const channel = supabase
      .channel(`page-extraction-results:file:${fileId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "page_extraction_results",
          filter: `file_id=eq.${fileId}`,
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
  }, [fileId]);

  return {
    results,
    loading,
    error,
    refetch: () => setRefetchTick((n) => n + 1),
  };
}
