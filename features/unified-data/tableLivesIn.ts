// features/unified-data/tableLivesIn.ts — WHERE IS THIS TABLE READ AND WRITTEN? (lane WHERE-LIVES-SWITCH)
//
// THE ONE APP-SIDE ANSWER, and it is the store's: `custom.where_tables_live(p_table_ids)`, which
// reads the organization's Data tables switch (FLIP-SEAMS' `platform.cutover_seam_press`), never
// "does the record store hold a Table with this id?".
//
// THE DEFECT THIS CLOSES (census row X1). COPY mode copied every older table into the record store
// under the SAME id and left the older table live until the owner presses his switch. Every
// resolver here decided "record store or older" by the copy's existence, so a chat append, a
// "save to table" and the agent-resources picker wrote the COPY while the owner kept working in
// the older table. Now:
//
//   · "older"  — the older table is live and its organization's switch is off: read and write the
//                older table. Its copy is read-only (the store refuses a write to it by name).
//   · "record" — the switch is on, or the older store never held this id: the record store's own
//                doors decide whether it exists and whether this person may open it.
//
// Nothing else in the app may decide this. `pnpm check:table-home-reads-the-switch` fails on a
// resolver that infers it from a copy's existence.

import type { SupabaseClient } from "@supabase/supabase-js";

export type TableLivesIn = "older" | "record";

export type TableLivesInAnswer =
  | { ok: true; livesIn: TableLivesIn; why: string }
  /** The store could not be asked. Never folded into "older" or "record". */
  | { ok: false; why: string };

interface Row {
  table_id?: unknown;
  lives_in?: unknown;
  why?: unknown;
}

/** Where each of `tableIds` lives, by id. An id missing from the map is an id the door did not answer. */
export async function tablesLiveIn(
  client: SupabaseClient,
  tableIds: readonly string[],
): Promise<{ ok: true; homes: Map<string, { livesIn: TableLivesIn; why: string }> } | { ok: false; why: string }> {
  const ids = [...new Set(tableIds.filter(Boolean))];
  const homes = new Map<string, { livesIn: TableLivesIn; why: string }>();
  if (ids.length === 0) return { ok: true, homes };
  const { data, error } = await client
    .schema("custom" as never)
    .rpc("where_tables_live" as never, { p_table_ids: ids } as never);
  if (error) return { ok: false, why: error.message };
  for (const row of ((data ?? []) as Row[])) {
    const id = typeof row.table_id === "string" ? row.table_id : null;
    const livesIn = row.lives_in === "older" || row.lives_in === "record" ? row.lives_in : null;
    if (id && livesIn) homes.set(id, { livesIn, why: typeof row.why === "string" ? row.why : "" });
  }
  return { ok: true, homes };
}

/** Where one table lives. */
export async function tableLivesIn(client: SupabaseClient, tableId: string): Promise<TableLivesInAnswer> {
  const answered = await tablesLiveIn(client, [tableId]);
  if (!answered.ok) return answered;
  const home = answered.homes.get(tableId);
  if (!home) return { ok: false, why: "the store did not say where this table lives" };
  return { ok: true, ...home };
}
