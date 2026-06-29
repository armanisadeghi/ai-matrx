/**
 * useWorkbookRealtime — subscribe to udt_workbook_snapshots inserts for one
 * workbook. Fires whenever a NEW snapshot is committed (any client, including
 * us). The caller passes a callback that receives the new snapshot id and
 * created_by, so it can decide whether to reload (e.g. ignore our own writes
 * via the created_by comparison).
 *
 * NOT a CRDT layer. This is "last write wins on the snapshot row," matching
 * the v1 storage model in `udt_v2_workbook_snapshots.sql`. Real concurrent
 * collab (per-keystroke CRDT updates) is a follow-up phase.
 */
"use client";

import { useEffect } from "react";

import { supabase } from "@/utils/supabase/client";

export type WorkbookRealtimeEvent = {
  snapshotId: string;
  createdBy: string | null;
  createdAt: string;
};

export function useWorkbookRealtime(
  workbookId: string | null | undefined,
  onSnapshot: (event: WorkbookRealtimeEvent) => void,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled || !workbookId) return undefined;

    const channel = supabase
      .channel(`udt_workbook_snapshots:${workbookId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "udt_workbook_snapshots",
          filter: `workbook_id=eq.${workbookId}`,
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
  }, [workbookId, enabled, onSnapshot]);
}
