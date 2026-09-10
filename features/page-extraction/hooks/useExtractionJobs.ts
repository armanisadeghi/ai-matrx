/**
 * features/page-extraction/hooks/useExtractionJobs.ts
 *
 * Shared-cache hook for "all jobs on this file". Re-fetches on Realtime
 * INSERT/UPDATE/DELETE on `page_extraction_jobs` for the given file.
 *
 * REALTIME: `@ai-matrx/realtime` owns the channel. What was here was a raw
 * `.channel(...).subscribe()`, a hand-copied refcount map, manual teardown, and
 * NO catch-up read — a job started on another device (or by the server) while
 * this tab slept never appeared in the picker. The refcount now lives once, in
 * `lib/realtime/sharedChannel`; `onBackfill` is the catch-up.
 */

"use client";

import { useEffect } from "react";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useRealtimeManager } from "@ai-matrx/realtime/react";
import { openShared } from "@/lib/realtime/sharedChannel";
import { listJobsForFile } from "@/features/page-extraction/api/jobs";
import type { PageExtractionJob } from "@/features/page-extraction/types";
import {
  createSharedStore,
  invalidateKey,
  setKey,
  useSharedStore,
} from "@/features/file-analysis/hooks/shared-cache";

// THE ARCHIVED-ITEMS LAW (../common-docs/policies/archived-items.md): the
// cache holds BOTH archived and active templates so a surface can reveal the
// archived ones without a second fetch; the hook hands out the split, and the
// plain `jobs` field stays active-only so every existing caller keeps the
// hide-by-default behaviour it already had.
const store = createSharedStore<PageExtractionJob[]>(async (fileId) => {
  return listJobsForFile(fileId, { includeArchived: true });
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
 * Optimistically remove a job from the shared cache (used by the sidebar's
 * archive affordance so the row leaves the ACTIVE list instantly). The
 * following refetch brings it back as an archived row, where the surface's
 * "Archived (N)" disclosure can reveal it — archived is not deleted.
 */
export function removeJobFromCache(fileId: string, jobId: string): void {
  setKey(store, fileId, (prev) => (prev ?? []).filter((j) => j.id !== jobId));
}

/** One place names this channel. A second, different declaration throws. */
const extractionJobsChannel = defineChannelNamespace({
  namespace: "page-extraction-jobs",
  parts: ["fileId"],
  description: "docproc.page_extraction_jobs rows for one file",
});

export interface UseExtractionJobsResult {
  /** Active templates only — what a surface shows by default. */
  jobs: PageExtractionJob[];
  /** Archived templates — what an "Archived (N)" disclosure reveals. */
  archivedJobs: PageExtractionJob[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useExtractionJobs(
  fileId: string | null,
): UseExtractionJobsResult {
  const { data, loading, error, refetch } = useSharedStore(store, fileId);
  const manager = useRealtimeManager();

  useEffect(() => {
    if (!fileId || !manager) return undefined;
    const topic = extractionJobsChannel.topic({ fileId });
    return openShared(manager, topic, () => ({
      topic,
      postgresChanges: [
        {
          event: "*",
          schema: "docproc",
          table: "page_extraction_jobs",
          filter: `file_id=eq.${fileId}`,
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          fingerprint: (row) =>
            JSON.stringify([row.name ?? null, row.status ?? null, row.updated_at ?? null]),
          onChange: () => invalidateKey(store, fileId),
        },
      ],
      // Realtime has no replay: a job created while the socket was down would
      // never show up in the picker.
      onBackfill: () => invalidateKey(store, fileId),
    }));
  }, [fileId, manager]);

  const all = data ?? [];

  return {
    jobs: all.filter((j) => !j.archived_at),
    archivedJobs: all.filter((j) => Boolean(j.archived_at)),
    loading,
    error,
    refetch,
  };
}
