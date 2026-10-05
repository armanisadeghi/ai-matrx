/**
 * RECORD FINDERS — `RecordDoor.find` for the item types the search projection
 * (`platform.search_items`, what `knowledge_search` reads) does not hold. Each
 * one reads the type's OWN bring-in picker list service — every organization the
 * person can reach, never the active one (access ladder) — and keeps the rows
 * whose name matches, archived rows left out. No new data path.
 */

import { dataHomeTables, type DataHomeTableRow } from "@/features/unified-data/hub/doors";
import { tablesToPick } from "@/features/unified-data/hub/tablePicking";
import { readPickListIndex } from "@/features/user-lists/pick-list-index";
import type { FoundRecord } from "./types";

/** Every word of the query appears in the name (case-insensitive). An empty query matches all. */
export function nameMatches(query: string, name: string): boolean {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const hay = name.toLowerCase();
  return words.every((w) => hay.includes(w));
}

const newestFirst = (a: FoundRecord, b: FoundRecord) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "");

/** Tables, through the table picker's list (`custom.data_home_tables()`, all organizations). */
export async function findTables(
  key: string,
  query: string,
  limit: number,
  read: () => Promise<{ ok: true; data: DataHomeTableRow[] } | { ok: false; error: { message?: string } }>,
): Promise<FoundRecord[]> {
  const answered = await read();
  if (!answered.ok) throw new Error(`Your tables could not be listed: ${answered.error.message ?? "unknown error"}`);
  return tablesToPick(answered.data)
    .filter((t) => nameMatches(query, t.table_name))
    .map((t) => ({ type: key, id: t.table_id, title: t.table_name, updated_at: t.updated_at, snippet: t.organization_name }))
    .sort(newestFirst)
    .slice(0, limit);
}

/** Picklists, through the picklist picker's index (`pick_list_index_everywhere`), archived left out. */
export async function findPickLists(
  key: string,
  query: string,
  limit: number,
  read: () => ReturnType<typeof readPickListIndex>,
): Promise<FoundRecord[]> {
  const answered = await read();
  if (!answered.ok) throw new Error(`Your picklists could not be listed: ${answered.why}`);
  const archived = new Set(answered.archivedIds);
  return answered.lists
    .filter((l) => !archived.has(l.id) && nameMatches(query, l.listName))
    .map((l) => ({
      type: key,
      id: l.id,
      title: l.listName,
      updated_at: l.updatedAt,
      ...(l.description ? { snippet: l.description } : {}),
    }))
    .sort(newestFirst)
    .slice(0, limit);
}

export { dataHomeTables, readPickListIndex };
