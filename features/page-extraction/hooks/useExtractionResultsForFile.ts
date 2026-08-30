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

import { useEffect, useMemo, useState } from "react";
import { useAsyncData, useRealtimeChannel } from "@ai-matrx/data/react";
import { supabase } from "@/utils/supabase/client";
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
  // Cancellation, stale-response ordering and honest errors from the package
  // (this hook used to render a PostgREST error as "[object Object]").
  const query = useAsyncData(
    () => listResultsForFile(fileId as string),
    [fileId],
    { enabled: fileId !== null },
  );

  const [live, setLive] = useState<PageExtractionResult[]>([]);
  useEffect(() => setLive([]), [fileId, query.data]);

  const bindings = useMemo(
    () => [
      {
        event: "INSERT" as const,
        schema: "docproc",
        table: "page_extraction_results",
        filter: `file_id=eq.${fileId ?? ""}`,
        onChange: (payload: { new?: unknown }) => {
          const row = payload.new as PageExtractionResult;
          setLive((prev) =>
            prev.some((r) => r.id === row.id) ? prev : [...prev, row],
          );
        },
      },
    ],
    [fileId],
  );

  useRealtimeChannel(
    supabase,
    `page-extraction-results:file:${fileId ?? "none"}`,
    bindings,
    { enabled: fileId !== null, onReconnect: query.refresh },
  );

  const results = useMemo(() => {
    const merged = [...(query.data ?? [])];
    for (const row of live) {
      if (!merged.some((r) => r.id === row.id)) merged.push(row);
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

  return {
    results,
    loading: query.loading,
    error: query.error?.message ?? null,
    refetch: query.refresh,
  };
}
