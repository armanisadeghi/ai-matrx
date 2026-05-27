/**
 * features/file-analysis/hooks/useFileAnalysis.ts
 *
 * Shared-cache hook for `GET /files/{id}/analysis`. Every component that
 * calls `useFileAnalysis(fileId)` subscribes to the same in-flight fetch
 * and the same cached result — no duplicate requests, no flash on remount,
 * no lag when switching tabs/routes.
 *
 * Realtime: ONE channel subscription per fileId (also cached at module
 * scope so the studio + the analysis tab share it). UPDATE events on
 * `file_analysis` invalidate-and-refetch through the shared store.
 * INSERT events on `file_analysis_result` append optimistically into the
 * cached value so the FE streams detector results live without polling.
 */

"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type {
  FileAnalysisResponse,
  FileAnalysisResultRow,
} from "@/features/file-analysis/api/file-analysis";
import {
  createSharedStore,
  invalidateKey,
  peekKey,
  scheduleInvalidate,
  useSharedStore,
  type SharedHookResult,
} from "./shared-cache";

const store = createSharedStore<FileAnalysisResponse>(async (fileId) => {
  const { data } = await Api.getAnalysis(fileId);
  return data;
});

// ── Realtime: one channel per fileId, refcounted across consumers. ───────
const realtimeRefcount = new Map<string, { count: number; cleanup: () => void }>();

function attachRealtime(fileId: string): void {
  const existing = realtimeRefcount.get(fileId);
  if (existing) {
    existing.count += 1;
    return;
  }
  const supabase = createClient();
  const channel = supabase
    .channel(`file-analysis:${fileId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "file_analysis",
        filter: `file_id=eq.${fileId}`,
      },
      // Backend analysis flows mutate the same `file_analysis` row many
      // times per second across detector tiers. Coalesce the burst —
      // fire once leading, once trailing, drop the middle.
      () => scheduleInvalidate(store, fileId),
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "file_analysis_result",
        filter: `file_id=eq.${fileId}`,
      },
      (payload) => {
        // Optimistic append; the next full refetch will dedupe via
        // DISTINCT ON (kind, tier).
        const next = payload.new as Partial<FileAnalysisResultRow> | undefined;
        if (!next?.id) {
          scheduleInvalidate(store, fileId);
          return;
        }
        const current = peekKey(store, fileId);
        if (!current) {
          scheduleInvalidate(store, fileId);
          return;
        }
        const merged = {
          ...current,
          results: [next as FileAnalysisResultRow, ...current.results],
        };
        // Direct mutate via the store entry to keep subscribers in sync.
        const entry = store.cache.get(fileId);
        if (entry) {
          entry.data = merged;
          for (const cb of Array.from(entry.subscribers)) cb();
        }
      },
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

export type UseFileAnalysisResult = SharedHookResult<FileAnalysisResponse>;

export function useFileAnalysis(fileId: string | null): UseFileAnalysisResult {
  const result = useSharedStore(store, fileId);

  useEffect(() => {
    if (!fileId) return;
    attachRealtime(fileId);
    return () => detachRealtime(fileId);
  }, [fileId]);

  return result;
}

/** Imperative invalidate for callers that just mutated server-side state. */
export function invalidateFileAnalysis(fileId: string): void {
  invalidateKey(store, fileId);
}
