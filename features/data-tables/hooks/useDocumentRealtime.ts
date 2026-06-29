/**
 * useDocumentRealtime — subscribe to udt_document_snapshots inserts for one
 * document. Fires whenever a NEW snapshot is committed (any client, including
 * us). The caller passes a callback that receives the new snapshot id and
 * created_by, so it can decide whether to reload (e.g. ignore our own writes
 * via the created_by comparison).
 *
 * Mirror of `useWorkbookRealtime`. CRDT (Yjs) is the source of truth for live
 * edits when the document is opened with `collab=true`; snapshot inserts then
 * act as periodic checkpoints rather than the live-edit channel.
 */
"use client";

import { useEffect } from "react";

import { supabase } from "@/utils/supabase/client";

export type DocumentRealtimeEvent = {
  snapshotId: string;
  createdBy: string | null;
  createdAt: string;
};

export function useDocumentRealtime(
  documentId: string | null | undefined,
  onSnapshot: (event: DocumentRealtimeEvent) => void,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled || !documentId) return undefined;

    const channel = supabase
      .channel(`udt_document_snapshots:${documentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "udt_document_snapshots",
          filter: `document_id=eq.${documentId}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            created_by?: string | null;
            created_at?: string;
          } | null;
          if (!row?.id) return;
          onSnapshot({
            snapshotId: row.id,
            createdBy: row.created_by ?? null,
            createdAt: row.created_at ?? new Date().toISOString(),
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [documentId, enabled, onSnapshot]);
}
