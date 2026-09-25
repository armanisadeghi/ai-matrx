// lib/entity-list/memoryService.ts
//
// An EntityListService over a corpus the browser already holds IN FULL.
//
// For small, bounded, read-only corpora (a few hundred to a few thousand rows:
// scanner findings, drift reports) whose source is a report or a view that
// cannot page/sort/facet by itself. The corpus is loaded ONCE per service
// instance (the `load` promise is shared by page, counts and facets), and
// search, filter, sort, paging and facet counts all run over the WHOLE loaded
// set — never over the visible page — so the app policy in ./columns.tsx
// ("every capability runs over the whole result set") still holds.
//
// Not for user-owned entity lists that grow without bound: those need a
// `<feature>_list_scoped` RPC (lib/list-scope/FEATURE.md).

import type { EntityListService } from "./config";
import {
  NONE_VALUE,
  type EntityFacets,
  type EntityListQuery,
  type EntityListSort,
  type EntityScopeCounts,
} from "./types";
import type { ListScopeKind } from "@/lib/list-scope/types";

export interface MemoryField<TRow> {
  /** The filterable / sortable value. `null`/`""` = no value (NONE_VALUE). */
  value: (row: TRow) => string | number | boolean | null | undefined;
  /** Sort by this instead of `value` (a rank behind a word, a date behind a label). */
  sortValue?: (row: TRow) => string | number | null | undefined;
  /** Offer this field's distinct values as a facet (select filter options). */
  facet?: boolean;
  /** Include this field in free-text search. */
  search?: boolean;
}

export interface MemoryServiceOptions<TRow> {
  load: () => Promise<TRow[]>;
  /** Keyed by COLUMN ID — the same ids the filter bag and sort use. */
  fields: Record<string, MemoryField<TRow>>;
  /** The one scope the corpus answers to (it has no owner axis). */
  scope: ListScopeKind;
  /** Fallback sort when the requested column is not a field. */
  defaultSort: string;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function matchesFilters<TRow>(
  row: TRow,
  query: EntityListQuery,
  fields: Record<string, MemoryField<TRow>>,
  skip?: string,
): boolean {
  for (const [id, filter] of Object.entries(query.filters)) {
    if (id === skip) continue;
    const field = fields[id];
    if (!field) continue;
    const raw = field.value(row);
    if (filter.kind === "select") {
      if (filter.values.length === 0) continue;
      const text = asText(raw);
      const key = text === "" ? NONE_VALUE : text;
      if (!filter.values.includes(key)) return false;
    } else if (filter.kind === "text") {
      if (!asText(raw).toLowerCase().includes(filter.value.toLowerCase())) return false;
    } else if (filter.kind === "boolean") {
      if (Boolean(raw) !== filter.value) return false;
    }
  }
  return true;
}

function matchesSearch<TRow>(
  row: TRow,
  search: string,
  fields: Record<string, MemoryField<TRow>>,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return Object.values(fields).some(
    (field) => field.search && asText(field.value(row)).toLowerCase().includes(needle),
  );
}

function compare(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // empty values sink in both directions
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return asText(a).localeCompare(asText(b), undefined, { numeric: true, sensitivity: "base" });
}

export function createMemoryListService<TRow>(
  options: MemoryServiceOptions<TRow>,
): EntityListService<TRow> {
  let corpus: Promise<TRow[]> | null = null;
  const all = () => {
    if (!corpus) {
      corpus = options.load().catch((error: unknown) => {
        corpus = null; // a failed read is retried on the next ask, never cached as empty
        throw error;
      });
    }
    return corpus;
  };
  const { fields } = options;

  const matching = async (query: EntityListQuery, skip?: string) =>
    (await all()).filter(
      (row) => matchesSearch(row, query.search, fields) && matchesFilters(row, query, fields, skip),
    );

  return {
    async fetchPage(query: EntityListQuery, sort: EntityListSort) {
      const rows = await matching(query);
      const field = fields[sort.sort] ?? fields[options.defaultSort];
      if (field) {
        const sign = sort.direction === "desc" ? -1 : 1;
        rows.sort((a, b) => {
          const read = field.sortValue ?? field.value;
          const av = read(a);
          const bv = read(b);
          const emptyA = av === null || av === undefined || av === "";
          const emptyB = bv === null || bv === undefined || bv === "";
          if (emptyA || emptyB) return compare(av, bv);
          return sign * compare(av, bv);
        });
      }
      const start = Math.max(0, (query.page - 1) * sort.pageSize);
      return { rows: rows.slice(start, start + sort.pageSize), total: rows.length };
    },
    async fetchCounts(query: EntityListQuery): Promise<EntityScopeCounts> {
      const rows = await matching(query);
      return { byKind: { [options.scope]: rows.length }, narrow: {} };
    },
    async fetchFacets(query: EntityListQuery): Promise<EntityFacets> {
      const byKind: EntityFacets["byKind"] = {};
      for (const [id, field] of Object.entries(fields)) {
        if (!field.facet) continue;
        // A facet's own filter is skipped so its options stay choosable.
        const rows = await matching(query, id);
        const counts = new Map<string, number>();
        for (const row of rows) {
          const text = asText(field.value(row));
          const key = text === "" ? NONE_VALUE : text;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        byKind[id] = [...counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      }
      return { byKind };
    },
  };
}
