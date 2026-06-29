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
  setKey,
  useSharedStore,
} from "@/features/file-analysis/hooks/shared-cache";

const store = createSharedStore<PageExtractionJob[]>(async (fileId) => {
  return listJobsForFile(fileId);
});

/**
 * Optimistically insert-or-replace a job in the shared cache so the
 * picker (and anything else reading `useExtractionJobs(fileId)`) sees
 * the new name **immediately** after a save — no need to wait for the
 * Supabase Realtime round-trip. Realtime will still fire and converge
 * to canonical state via `invalidateKey`; this is just the fast path
 * for the in-tab actor.
 *
 * Ordering matches `listJobsForFile`: newest `created_at` first.
 */
export function upsertJobInCache(fileId: string, job: PageExtractionJob): void {
  setKey(store, fileId, (prev) => {
    const list = prev ?? [];
    const without = list.filter((j) => j.id !== job.id);
    return [job, ...without].sort((a, b) => {
      const at = new Date(a.created_at ?? 0).getTime();
      const bt = new Date(b.created_at ?? 0).getTime();
      return bt - at;
    });
  });
}

/**
 * Optimistically remove a job from the shared cache (used by the
 * sidebar's soft-delete affordance so the row vanishes instantly).
 */
export function removeJobFromCache(fileId: string, jobId: string): void {
  setKey(store, fileId, (prev) => (prev ?? []).filter((j) => j.id !== jobId));
}

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
    if (!fileId) return undefined;
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
