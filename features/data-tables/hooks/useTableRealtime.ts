/**
 * useTableRealtime — subscribe to udt_dataset_rows changes for one table.
 *
 * Wires a Supabase Postgres-Changes subscription that fires when any row in
 * the given `tableId` is INSERTed, UPDATEd, or DELETEd. The caller passes a
 * single `onChange` callback that is invoked with the change kind + row id
 * for each event. Bring your own debouncing — see UserTableViewer for the
 * canonical "refetch the page" wiring.
 *
 * Why this hook exists, not a direct subscribe at every callsite:
 *   - Centralizes the channel name convention (`udt_rows:<tableId>`), so
 *     multiple subscribers in the same client share one channel.
 *   - Honors RLS automatically — the subscription server-side filters by the
 *     authenticated user's permission, matching the SELECT policy on
 *     udt_dataset_rows.
 *   - Cleans up on tableId change / unmount.
 *
 * Note on fanout: every row insert/update/delete from any client (including
 * your own writes) fires this. A 10k-row bulk import fires 10k events; for
 * importer flows, prefer to NOT subscribe during the import and refetch once
 * at the end (see FEATURE.md "Realtime fanout" gotcha).
 */
"use client";

import { useEffect } from "react";

import { supabase } from "@/utils/supabase/client";

export type TableRealtimeEvent = {
  kind: "INSERT" | "UPDATE" | "DELETE";
  rowId: string | null;
};

export function useTableRealtime(
  tableId: string | null | undefined,
  onChange: (event: TableRealtimeEvent) => void,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled || !tableId) return;

    const channel = supabase
      .channel(`udt_rows:${tableId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "udt_dataset_rows",
          filter: `table_id=eq.${tableId}`,
        },
        (payload) => {
          const kind = payload.eventType as TableRealtimeEvent["kind"];
          // `new` is empty on DELETE; `old` is empty on INSERT.
          const newRow = payload.new as { id?: string } | null;
          const oldRow = payload.old as { id?: string } | null;
          onChange({ kind, rowId: newRow?.id ?? oldRow?.id ?? null });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tableId, enabled, onChange]);
}
