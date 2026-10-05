/**
 * The pure half of `board_add_items` and `board_find_records`: an agent's entry
 * resolved against the item catalog, and a topic search across the person's
 * records. The catalog is passed in (the host's `itemTypes`) so this file never
 * imports a tile body.
 *
 * `board_add_items` reuses each type's OWN builders: `record.place` (the one
 * the bring-in picker places with) for an existing record, the type's first
 * `startNew` entry for a new one — only when that entry is a direct `create`
 * (a Picker or Dialog start needs the person and says so).
 *
 * `board_find_records` reads the search projection (`platform.search_items`,
 * the index `knowledge_search` reads, as the person; every organization they
 * belong to; trashed rows are not projected) for the types it holds, and each
 * other type's `record.find` (its bring-in picker's list service).
 */

import type { BoardItemType, FoundRecord, PlacedItem } from "../items/types";
import { startNewEntries } from "../items/types";
import { BOARD_FIND_RECORDS_MAX } from "./board-tools";

export interface AddItemEntry {
  type?: unknown;
  id?: unknown;
  new?: unknown;
  title?: unknown;
}

export type ResolvedEntry =
  | { ok: true; item: PlacedItem & { size: { w: number; h: number } } }
  | { ok: false; status: "needs_person" | "refused"; error: string };

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function resolveAddEntry(entry: AddItemEntry, types: readonly BoardItemType[]): ResolvedEntry {
  const key = text(entry.type);
  const type = key ? types.find((t) => t.key === key) : undefined;
  if (!type) return { ok: false, status: "refused", error: `Unknown item type "${String(entry.type)}".` };
  const id = text(entry.id);
  const title = text(entry.title);
  const sized = (item: PlacedItem) => ({
    ok: true as const,
    item: { ...item, ...(title ? { title } : {}), size: item.size ?? type.defaultSize },
  });
  if (id) {
    if (!type.record) {
      return {
        ok: false,
        status: "refused",
        error: `A ${type.label.toLowerCase()} cannot be placed by id; the person brings one in from the Add menu.`,
      };
    }
    return sized(type.record.place(id, title));
  }
  if (entry.new !== true) return { ok: false, status: "refused", error: "Pass the record's `id`, or `new: true`." };
  const first = startNewEntries(type)[0];
  if (!first) return { ok: false, status: "refused", error: `A new ${type.label.toLowerCase()} cannot be started on a board.` };
  if (!("create" in first)) {
    return {
      ok: false,
      status: "needs_person",
      error: `"${first.label}" needs the person to choose first: they start it from the board's Add menu.`,
    };
  }
  return sized(first.create());
}

/** One row of `platform.search_items` (the fields used here). */
export interface SearchItemRow {
  entity_token: string;
  entity_id: string;
  title: string | null;
  subtitle: string | null;
  updated_at: string | null;
}

export type SearchItems = (args: { query: string; tokens: string[]; limit: number }) => Promise<SearchItemRow[]>;

export interface FindRecordsResult {
  ok: true;
  records: FoundRecord[];
  /** More matched than `limit`: narrow with `types` or a sharper query. */
  more: boolean;
  /** Types that could not be searched this time, with why. */
  unsearched?: { types: string[]; why: string }[];
}

export async function findBoardRecords(
  input: { query?: unknown; types?: unknown; limit?: unknown },
  types: readonly BoardItemType[],
  searchItems: SearchItems,
  opts: { exclude?: { type: string; id: string }[] } = {},
): Promise<FindRecordsResult | { ok: false; error: string }> {
  const query = text(input.query);
  if (!query) return { ok: false, error: "Pass `query`: words in the records' names." };
  const wanted = Array.isArray(input.types) ? input.types.filter((t): t is string => typeof t === "string") : [];
  const unknown = wanted.filter((k) => !types.some((t) => t.key === k && (t.record?.searchToken || t.record?.find)));
  if (unknown.length > 0) return { ok: false, error: `These types cannot be searched: ${unknown.join(", ")}.` };
  const limit = Math.min(
    Math.max(1, Math.floor(typeof input.limit === "number" && Number.isFinite(input.limit) ? input.limit : 25)),
    BOARD_FIND_RECORDS_MAX,
  );
  const pool = types.filter((t) => t.record && (wanted.length === 0 || wanted.includes(t.key)));
  const keyOfToken = new Map(pool.flatMap((t) => (t.record?.searchToken ? [[t.record.searchToken, t.key] as const] : [])));
  const finders = pool.filter((t) => t.record?.find);

  const unsearched: { types: string[]; why: string }[] = [];
  const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const lanes: Promise<FoundRecord[]>[] = [];
  if (keyOfToken.size > 0) {
    lanes.push(
      searchItems({ query, tokens: [...keyOfToken.keys()], limit: limit + 1 })
        .then((rows) =>
          rows.flatMap((r) => {
            const type = keyOfToken.get(r.entity_token);
            if (!type) return [];
            return [
              {
                type,
                id: r.entity_id,
                title: r.title?.trim() || "(untitled)",
                updated_at: r.updated_at,
                ...(r.subtitle ? { snippet: r.subtitle } : {}),
              },
            ];
          }),
        )
        .catch((e: unknown) => {
          unsearched.push({ types: [...keyOfToken.values()], why: why(e) });
          return [];
        }),
    );
  }
  for (const t of finders) {
    lanes.push(
      t.record!.find!(query, limit + 1).catch((e: unknown) => {
        unsearched.push({ types: [t.key], why: why(e) });
        return [];
      }),
    );
  }
  // Each lane keeps its own rank; lanes take turns, so a cap never drops a whole type.
  const answered = await Promise.all(lanes);
  const all: FoundRecord[] = [];
  for (let i = 0; answered.some((lane) => i < lane.length); i++) {
    for (const lane of answered) if (i < lane.length) all.push(lane[i]);
  }
  const seen = new Set<string>((opts.exclude ?? []).map((r) => `${r.type}:${r.id}`));
  const records = all.filter((r) => {
    const k = `${r.type}:${r.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    ok: true,
    records: records.slice(0, limit),
    more: records.length > limit,
    ...(unsearched.length > 0 ? { unsearched } : {}),
  };
}
