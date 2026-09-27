// features/data-tables/data-source/one-row-per-table.ts — A TABLE IN BOTH STORES IS LISTED ONCE.
//
// `custom.table_list_everywhere` unions the record store's Tables with the person's older datasets
// (`union all`). COPY mode keeps an older table's copy in the record store under the SAME id, so a
// table in both stores came back twice: the tables picker drew it twice and React threw a
// duplicate-key error (merged-grid review 2, fix lane F item 3). The one row kept is the one for the
// store the table LIVES in (`custom.where_tables_live`, the store's own answer — the lead's routing,
// never re-decided here): the older row until the flip, the record-store row after it.

import type { SupabaseClient } from "@supabase/supabase-js";

import { tablesLiveIn } from "@/features/unified-data/tableLivesIn";

interface ListedTable {
  id?: unknown;
  store?: unknown;
}

/**
 * One row per table id, in the list's own order. Only ids listed twice cost a question; if the store
 * cannot be asked, the older row is kept (that is where a both-store table lives until the flip) and
 * the failure is logged, never a silently doubled list.
 */
export async function oneRowPerTable<T extends ListedTable>(client: SupabaseClient, rows: readonly T[]): Promise<T[]> {
  const count = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.id);
    count.set(id, (count.get(id) ?? 0) + 1);
  }
  const doubled = [...count].filter(([, n]) => n > 1).map(([id]) => id);
  if (doubled.length === 0) return [...rows];
  const answered = await tablesLiveIn(client, doubled);
  if (!answered.ok) console.warn(`[data-tables] Could not ask where ${doubled.length} table(s) in both stores live; listing their older rows: ${answered.why}`);
  const keep = (row: T): boolean => {
    const id = String(row.id);
    if ((count.get(id) ?? 0) < 2) return true;
    const livesIn = answered.ok ? answered.homes.get(id)?.livesIn : undefined;
    return (livesIn ?? "older") === "record" ? row.store === "records" : row.store !== "records";
  };
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id) || !keep(row)) continue;
    seen.add(id);
    out.push(row);
  }
  // Every id is listed exactly once, even if neither row matched the answer.
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}
