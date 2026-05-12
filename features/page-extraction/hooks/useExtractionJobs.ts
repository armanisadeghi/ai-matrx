/**
 * features/page-extraction/hooks/useExtractionJobs.ts
 *
 * Shared-cache hook for "all jobs on this file". Re-fetches on Realtime
 * INSERT/UPDATE/DELETE on `page_extraction_jobs` for the given file.
 */

"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { listJobsForFile } from "@/features/page-extraction/api/jobs";
import type { PageExtractionJob } from "@/features/page-extraction/types";
import {
  createSharedStore,
  invalidateKey,
  useSharedStore,
} from "@/features/file-analysis/hooks/shared-cache";

const store = createSharedStore<PageExtractionJob[]>(async (fileId) => {
  return listJobsForFile(fileId);
});

const realtimeRefcount = new Map<
  string,
  { count: number; cleanup: () => void }
>();

function attachRealtime(fileId: string): void {
  const existing = realtimeRefcount.get(fileId);
  if (existing) {
    existing.count += 1;
    return;
  }
  const supabase = createClient();
  const channel = supabase
    .channel(`page-extraction-jobs:${fileId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "page_extraction_jobs",
        filter: `file_id=eq.${fileId}`,
      },
      () => invalidateKey(store, fileId),
    )
    .subscribe();
  realtimeRefcount.set(fileId, {
    count: 1,
    cleanup: () => {
      void supabase.removeChannel(channel);
    },
  });
}

function detachRealtime(fileId: string): void {
  const existing = realtimeRefcount.get(fileId);
  if (!existing) return;
  existing.count -= 1;
  if (existing.count <= 0) {
    existing.cleanup();
    realtimeRefcount.delete(fileId);
  }
}

export interface UseExtractionJobsResult {
  jobs: PageExtractionJob[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useExtractionJobs(
  fileId: string | null,
): UseExtractionJobsResult {
  const { data, loading, error, refetch } = useSharedStore(store, fileId);

  useEffect(() => {
    if (!fileId) return;
    attachRealtime(fileId);
    return () => detachRealtime(fileId);
  }, [fileId]);

  return {
    jobs: data ?? [],
    loading,
    error,
    refetch,
  };
}
