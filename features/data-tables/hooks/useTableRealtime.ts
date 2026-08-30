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
 *   - Centralizes the channel name convention (`udt_rows:<tableId>`) and the
 *     event-shape parsing. Each mount gets its own uniquely-suffixed channel
 *     — @supabase/realtime-js dedupes `.channel()` by topic and throws if a
 *     second `.on()` is added to an already-`subscribe()`d channel, so two
 *     instances can no longer safely share one channel object.
 *   - Honors RLS automatically — the subscription server-side filters by the
 *     authenticated user's permission, matching the SELECT policy on
 *     udt_dataset_rows.
 *   - Cleans up on tableId change / unmount.
 *
 * 🚨 YOUR OWN WRITES COME BACK. Every insert/update/delete from any client —
 * including this one — fires this subscription, 50–500ms AFTER your REST call
 * already returned the fresh row. A consumer that reacts by refetching is
 * therefore reloading the whole table to learn what it just wrote, and the user
 * sees the grid flash and lose its place a beat after every save. Suppress the
 * echo with the row's `updated_at` (never with an in-flight flag, which is
 * always already cleared by the time the echo lands) — see UserTableViewer.
 *
 * Note on fanout: every row insert/update/delete from any client (including
 * your own writes) fires this. A 10k-row bulk import fires 10k events; for
 * importer flows, prefer to NOT subscribe during the import and refetch once
 * at the end (see FEATURE.md "Realtime fanout" gotcha).
 */
"use client";

import { useMemo, useRef } from "react";

import { useRealtimeChannel } from "@ai-matrx/data/react";
import { supabase } from "@/utils/supabase/client";

export type TableRealtimeRow = {
  id?: string;
  data?: Record<string, unknown>;
  updated_at?: string;
};

export type TableRealtimeEvent = {
  kind: "INSERT" | "UPDATE" | "DELETE";
  rowId: string | null;
  /**
   * The row as the server now holds it (empty on DELETE).
   *
   * Carried deliberately: without it a consumer can only answer "something
   * changed" with a full refetch, which remounts the grid and throws away the
   * user's place — for a change we may well have made ourselves. With the row
   * in hand a consumer can suppress its own echo by `updated_at` and patch a
   * remote change in place. See the `supabase-realtime` skill, rules 1 and 2.
   */
  row: TableRealtimeRow | null;
};

export function useTableRealtime(
  tableId: string | null | undefined,
  onChange: (event: TableRealtimeEvent) => void,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;

  // Held in a ref so the subscription's lifetime is tied to the TABLE, not to
  // the identity of the handler.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const bindings = useMemo(
    () => [
      {
        event: "*" as const,
        schema: "workbench",
        table: "udt_dataset_rows",
        filter: `table_id=eq.${tableId ?? ""}`,
        // `onChange` is read through a ref: an inline callback changes
        // identity every render, and depending on it would tear the channel
        // down and rebuild it each time. The package keeps the subscription
        // stable as long as the binding SHAPE is stable, which is what this
        // memo guarantees.
        onChange: (payload: {
          eventType?: string;
          new?: unknown;
          old?: unknown;
        }) => {
          const kind = payload.eventType as TableRealtimeEvent["kind"];
          // `new` is empty on DELETE; `old` is empty on INSERT.
          const newRow = (payload.new ?? null) as TableRealtimeRow | null;
          const oldRow = (payload.old ?? null) as TableRealtimeRow | null;
          onChangeRef.current({
            kind,
            rowId: newRow?.id ?? oldRow?.id ?? null,
            row: newRow && Object.keys(newRow).length > 0 ? newRow : null,
          });
        },
      },
    ],
    [tableId],
  );

  // Unique topics, reconnect with backoff, honest status and guaranteed
  // teardown all live in @ai-matrx/data/react.
  useRealtimeChannel(supabase, `udt_rows:${tableId ?? "none"}`, bindings, {
    enabled: enabled && Boolean(tableId),
  });
}
