/**
 * features/rag/hooks/rag-job-realtime.ts
 *
 * Refcounted Supabase Realtime subscription on `cld_file_rag_jobs`, keyed by
 * file_id. This is what replaced the old 3s/15s polling in `useFileRagStatus`:
 * the table is in the `supabase_realtime` publication (aidream kg_032) and RLS
 * scopes SELECT to `user_id = auth.uid()`, so a browser only ever receives its
 * own job rows.
 *
 * One channel per fileId is shared across every consumer (FileInfoTab,
 * DocumentTab, the status chip) and torn down when the last listener detaches —
 * mirroring `features/file-analysis/hooks/useFileAnalysis.ts`.
 *
 * On any INSERT/UPDATE/DELETE to a file's job row we invoke each listener; the
 * caller invalidates its React Query so the canonical `/files/{id}/rag-status`
 * contract (which merges the job row with the `processed_documents` anchor) is
 * re-read exactly once per real transition instead of on a timer.
 */

"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

type Listener = () => void;

interface ChannelEntry {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
}

const channels = new Map<string, ChannelEntry>();

/**
 * Subscribe to live job-row changes for `fileId`. Returns an unsubscribe fn.
 * The underlying channel is created on the first subscriber and removed when
 * the last one unsubscribes.
 */
export function subscribeToFileRagJob(
  fileId: string,
  listener: Listener,
): () => void {
  let entry = channels.get(fileId);

  const supabase = createClient();

  if (!entry) {
    const newEntry: ChannelEntry = {
      channel: undefined as unknown as RealtimeChannel,
      listeners: new Set<Listener>(),
    };
    newEntry.channel = supabase
      .channel(`rag-job:${fileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cld_file_rag_jobs",
          filter: `file_id=eq.${fileId}`,
        },
        () => {
          for (const cb of Array.from(newEntry.listeners)) cb();
        },
      )
      .subscribe();
    channels.set(fileId, newEntry);
    entry = newEntry;
  }

  entry.listeners.add(listener);

  return () => {
    const current = channels.get(fileId);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      void supabase.removeChannel(current.channel);
      channels.delete(fileId);
    }
  };
}
