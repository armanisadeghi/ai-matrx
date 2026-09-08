/**
 * features/rag/hooks/rag-job-realtime.ts
 *
 * Refcounted live subscription on `files.file_rag_jobs`, keyed by file_id. This
 * is what replaced the old 3s/15s polling in `useFileRagStatus`: the table is in
 * the `supabase_realtime` publication (aidream kg_032) and RLS scopes SELECT to
 * the owning user, so a browser only ever receives its own job rows.
 *
 * One channel per fileId is shared across every consumer (FileInfoTab,
 * DocumentTab, the status chip) and torn down when the last listener detaches.
 *
 * REALTIME: `@ai-matrx/realtime` owns the channel — unique instance topic, echo
 * suppression, dedup, the decoupled handler queue, jittered reconnect, tab
 * sleep, diagnostics. What used to be here was a raw `.channel(...).subscribe()`
 * on a static topic with a hand-rolled listener map and NO catch-up read: a tab
 * that slept through an ingestion run woke showing "processing" forever, because
 * the terminal event had already been delivered to a dead socket. `onBackfill`
 * is that fix — every recovery path re-invokes the listeners, and the caller's
 * React Query invalidation re-reads the canonical
 * `/files/{id}/knowledge-status` contract exactly once.
 *
 * This module is not a React component, so it takes the manager through the
 * package's ambient door (`subscribeToRealtimeManager`, realtime 0.6.0) rather
 * than building one of its own — a second manager is a second write ledger.
 */

"use client";

import { subscribeToRealtimeManager, defineChannelNamespace } from "@ai-matrx/realtime";

type Listener = () => void;

interface ChannelEntry {
  listeners: Set<Listener>;
  /** Closes the channel and detaches from the ambient manager. */
  stop: () => void;
}

/** One place names this channel. A second, different declaration throws. */
const ragJobChannel = defineChannelNamespace({
  namespace: "rag-job",
  parts: ["fileId"],
  description: "files.file_rag_jobs rows for one file",
});

const entries = new Map<string, ChannelEntry>();

/**
 * Subscribe to live job-row changes for `fileId`. Returns an unsubscribe fn.
 * The underlying channel is opened on the first subscriber and closed when the
 * last one unsubscribes.
 */
export function subscribeToFileRagJob(
  fileId: string,
  listener: Listener,
): () => void {
  let entry = entries.get(fileId);

  if (!entry) {
    const created: ChannelEntry = {
      listeners: new Set<Listener>(),
      stop: () => {},
    };
    const notify = (): void => {
      for (const cb of Array.from(created.listeners)) cb();
    };
    created.stop = subscribeToRealtimeManager(() => ({
      topic: ragJobChannel.topic({ fileId }),
      postgresChanges: [
        {
          event: "*",
          schema: "files",
          table: "file_rag_jobs",
          filter: `file_id=eq.${fileId}`,
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          fingerprint: (row) =>
            JSON.stringify([row.status ?? null, row.error ?? null, row.progress ?? null]),
          onChange: notify,
        },
      ],
      // Realtime has no replay. Reconnect, tab wake, network restore and queue
      // overflow all land here; the listeners re-read the canonical status.
      onBackfill: notify,
    }));
    entries.set(fileId, created);
    entry = created;
  }

  entry.listeners.add(listener);

  return () => {
    const current = entries.get(fileId);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      current.stop();
      entries.delete(fileId);
    }
  };
}
