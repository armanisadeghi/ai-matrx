/**
 * useWorkbookRealtime — subscribe to udt_workbook_snapshots inserts for one
 * workbook. Fires whenever a NEW snapshot is committed (any client, including
 * us). The caller passes a callback that receives the new snapshot id and
 * created_by, so it can decide whether to reload (e.g. ignore our own writes
 * via the created_by comparison).
 *
 * NOT a CRDT layer. This is "last write wins on the snapshot row," matching
 * the v1 storage model in `udt_v2_workbook_snapshots.sql`. Real concurrent
 * collab (per-keystroke CRDT updates) is a follow-up phase. *
 * REALTIME: `@ai-matrx/realtime` owns the channel (`useChannel`) — dedup, the
 * decoupled ordered handler queue, jittered reconnect, tab sleep, diagnostics.
 * What was here was a raw `.channel(...).subscribe()` with manual teardown and
 * NO catch-up read, which on this surface is the worst version of the bug: a
 * snapshot committed by a collaborator while the tab slept was never seen, so
 * the next local save checkpointed on top of a base that had already moved.
 * `onBackfill` re-reads the newest snapshot and hands it to the same callback,
 * so a recovery is indistinguishable from having received the event.
 *
 * Echo suppression is deliberately NOT relied on here: these are INSERTs of
 * new rows this client never registers on the write ledger, and the caller's
 * `created_by` comparison is the contract — every insert is delivered.
 */
"use client";

import { useCallback } from "react";

import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useChannel } from "@ai-matrx/realtime/react";
import { supabase } from "@/utils/supabase/client";

export type WorkbookRealtimeEvent = {
  snapshotId: string;
  createdBy: string | null;
  createdAt: string;
};

/** One place names this channel. A second, different declaration throws. */
const workbookSnapshotsChannel = defineChannelNamespace({
  namespace: "udt-workbook-snapshots",
  parts: ["workbookId"],
  description: "workbench.udt_workbook_snapshots inserts for one workbook",
});

type SnapshotRow = {
  id?: string;
  created_by?: string | null;
  created_at?: string;
};

export function useWorkbookRealtime(
  workbookId: string | null | undefined,
  onSnapshot: (event: WorkbookRealtimeEvent) => void,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;

  const emit = useCallback(
    (row: SnapshotRow | null) => {
      if (!row?.id) return;
      onSnapshot({
        snapshotId: row.id,
        createdBy: row.created_by ?? null,
        createdAt: row.created_at ?? new Date().toISOString(),
      });
    },
    [onSnapshot],
  );

  useChannel(
    enabled && workbookId
      ? {
          topic: workbookSnapshotsChannel.topic({ workbookId }),
          postgresChanges: [
            {
              event: "INSERT",
              schema: "workbench",
              table: "udt_workbook_snapshots",
              filter: `workbook_id=eq.${workbookId}`,
              rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
              onChange: ({ row }) => emit(row as SnapshotRow | null),
            },
          ],
          // Realtime has no replay. Re-read the newest snapshot so a reconnect,
          // tab wake or network restore cannot leave this client checkpointing
          // on top of a base that moved while it was away.
          onBackfill: async () => {
            const { data, error } = await supabase
              .schema("workbench")
              .from("udt_workbook_snapshots")
              .select("id, created_by, created_at")
              .eq("workbook_id", workbookId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (error) {
              // Not silent: without this read the caller is working from a
              // base it cannot know is stale.
              console.warn(
                "[udt-workbook RT] catch-up read failed — this workbook may be " +
                  "working from a stale snapshot base; reload before saving.",
                error.message,
              );
              return;
            }
            emit(data as SnapshotRow | null);
          },
        }
      : null,
  );
}
