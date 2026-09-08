/**
 * features/file-analysis/hooks/useFileAnalysis.ts
 *
 * Shared-cache hook for `GET /files/{id}/analysis`. Every component that
 * calls `useFileAnalysis(fileId)` subscribes to the same in-flight fetch
 * and the same cached result — no duplicate requests, no flash on remount,
 * no lag when switching tabs/routes.
 *
 * REALTIME: `@ai-matrx/realtime` owns the channel — unique instance topic,
 * echo suppression, dedup, the decoupled handler queue, jittered reconnect,
 * the backfill door, tab sleep, diagnostics. This module hand-rolled a static
 * topic (`file-analysis:<fileId>`), a raw `.channel(...).subscribe()`, a manual
 * `removeChannel` teardown, and NO catch-up read: a tab that slept through a
 * detector run came back showing a partial result list and no sign of it. That
 * is the bug this adoption fixes. None of it may grow back.
 *
 * UPDATE events on `files.analysis` invalidate-and-refetch through the shared
 * store. INSERT events on `files.analysis_result` append optimistically into the
 * cached value so the FE streams detector results live without polling.
 *
 * The one host-shaped thing left is fan-in: the studio shell, the inspector
 * rail and every tab panel mount this hook for the same file, and they share
 * ONE channel through `lib/realtime/sharedChannel`.
 *
 * The user-triggered refresh flow does NOT rely on this channel: since the
 * 2026-07 stream-everything conversion, `POST /analysis/refresh` streams
 * per-detector progress and its terminal event carries the full GET-shaped
 * payload, which the caller writes into this cache via `mutate` (see
 * AnalysisTab.handleRefresh). Realtime here serves passive viewers and the
 * upload-hook / lazy-backfill paths. The plain GET remains legitimate for
 * initial load — it is never a poll target after a refresh.
 */

"use client";

import { useEffect } from "react";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useRealtimeManager } from "@ai-matrx/realtime/react";
import { openShared } from "@/lib/realtime/sharedChannel";
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

/** One place names this channel. A second, different declaration throws. */
const analysisChannel = defineChannelNamespace({
  namespace: "file-analysis",
  parts: ["fileId"],
  description: "files.analysis + files.analysis_result rows for one file",
});

/** The analysis-row content this app renders — powers the echo test. */
function analysisFingerprint(row: Record<string, unknown>): string {
  return JSON.stringify([
    row.status ?? null,
    row.summary ?? null,
    row.error ?? null,
    row.completed_at ?? null,
  ]);
}

/** Append one streamed detector result into the cached value, in place. */
function appendResult(fileId: string, next: Partial<FileAnalysisResultRow>): void {
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
}

export type UseFileAnalysisResult = SharedHookResult<FileAnalysisResponse>;

export function useFileAnalysis(fileId: string | null): UseFileAnalysisResult {
  const result = useSharedStore(store, fileId);
  const manager = useRealtimeManager();

  useEffect(() => {
    if (!fileId || !manager) return undefined;
    const topic = analysisChannel.topic({ fileId });
    return openShared(manager, topic, () => ({
      topic,
      postgresChanges: [
        {
          event: "UPDATE",
          schema: "files",
          table: "analysis",
          filter: `file_id=eq.${fileId}`,
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          fingerprint: analysisFingerprint,
          // Backend analysis flows mutate the same row many times per second
          // across detector tiers. Coalesce the burst — once leading, once
          // trailing, drop the middle.
          onChange: () => scheduleInvalidate(store, fileId),
        },
        {
          event: "INSERT",
          schema: "files",
          table: "analysis_result",
          filter: `file_id=eq.${fileId}`,
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          // Optimistic append; the next full refetch dedupes via
          // DISTINCT ON (kind, tier). The package already deduped a
          // redelivered INSERT before this runs, so the append is safe.
          onChange: ({ row }) => {
            const next = row as Partial<FileAnalysisResultRow> | null;
            if (!next?.id) {
              scheduleInvalidate(store, fileId);
              return;
            }
            appendResult(fileId, next);
          },
        },
      ],
      // Realtime has no replay. The hand-rolled channel had no catch-up read,
      // so a slept tab showed a partial detector list forever. Every recovery
      // path now lands here.
      onBackfill: () => {
        invalidateKey(store, fileId);
      },
    }));
  }, [fileId, manager]);

  return result;
}

/** Imperative invalidate for callers that just mutated server-side state. */
export function invalidateFileAnalysis(fileId: string): void {
  invalidateKey(store, fileId);
}
