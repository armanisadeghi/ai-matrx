// lib/entity-list/types.ts
//
// The feature-agnostic half of a canonical entity-list surface. Extracted from
// features/agents/browse (live at /agents/all) — the proving ground. Nothing
// here knows what an agent is.
//
// THE SPLIT THAT RUNS THROUGH THIS WHOLE SYSTEM:
//
//   QUERY  — scope, search, filters, page. Lives here. NEVER persisted:
//            restoring a stale search that renders an empty list is a bug
//            wearing a feature's clothes.
//   STYLE  — view mode, density, sort, page size, columns. Lives in
//            lib/list-views (persisted per user, synced across devices).
//
// See features/agents/browse/FEATURE.md for the worked implementation and
// lib/list-scope/FEATURE.md for the scope vocabulary + RPC template rules.

import type { ListScope, ListScopeKind } from "@/lib/list-scope/types";
import { DEFAULT_LIST_SCOPE } from "@/lib/list-scope/types";

/** Sentinel for "has no value" (uncategorized / untagged). Matches the SQL. */
export const NONE_VALUE = "__none__";

/**
 * ONE filter vocabulary, shared by column headers and any filter panel.
 * Serialized straight into `<feature>_list_scoped(p_filters)`, so a filter set
 * from a column header and the same filter set from a panel are the same query
 * and cannot drift.
 *
 * Mirrors MatrxDataTable's ColumnFilterValue on purpose — the table is the
 * primary producer, and a translation layer with its own vocabulary would be a
 * third place for the two to disagree.
 */
export type EntityFilterValue =
  | { kind: "text"; value: string }
  | { kind: "select"; values: string[] }
  | { kind: "boolean"; value: boolean };

/** Keyed by COLUMN ID, so the server predicate and the header agree by name. */
export type EntityFilters = Record<string, EntityFilterValue>;

export type ArchivedFilter = "active" | "archived" | "all";

export interface EntityListQuery {
  scope: ListScope;
  search: string;
  /**
   * Reach into full record content (prompt bodies, transcript text...).
   * Opt-in: it is a full scan server-side and must never be the default.
   */
  deep: boolean;
  /**
   * Kept OUT of `filters` because it carries a DEFAULT ("active only") rather
   * than being absent-means-unfiltered like every other column.
   */
  archived: ArchivedFilter;
  filters: EntityFilters;
  /** One-based, matching the pagination UI. */
  page: number;
}

export const DEFAULT_ENTITY_LIST_QUERY: EntityListQuery = {
  scope: DEFAULT_LIST_SCOPE,
  search: "",
  deep: false,
  archived: "active",
  filters: {},
  page: 1,
};

/**
 * How many things are narrowing the list right now (the Filters badge).
 * Counts ONLY what the user applied — never the sort or the active scope.
 * A badge that reads "1" on an untouched page is a permanent lie that trains
 * people to ignore the number (which is exactly what /agents/all's did).
 */
export function countActiveFilters(query: EntityListQuery): number {
  return (
    Object.keys(query.filters).length + (query.archived !== "active" ? 1 : 0)
  );
}

/**
 * One narrowing choice inside a scope — an org under "My Orgs", an industry
 * under "Industry". The LABEL comes from the same query as the count.
 *
 * That is deliberate and load-bearing: reading names from a Redux slice meant
 * depending on `fetchFullContext`, a thunk that only runs on tasks/org-settings
 * surfaces — so on /agents/all the slice was empty and the My Orgs dropdown
 * silently never rendered. A tab bar must be self-sufficient from its own
 * query, with no hydration ordering to get wrong.
 */
export interface ScopeNarrowOption {
  id: string;
  label: string;
  count: number;
}

export interface EntityScopeCounts {
  /** True server-side total per scope kind. Absent kinds are unsupported. */
  byKind: Partial<Record<ListScopeKind, number>>;
  /** Narrowing options per scope kind, in server order. */
  narrow: Partial<Record<ListScopeKind, ScopeNarrowOption[]>>;
}

export const EMPTY_SCOPE_COUNTS: EntityScopeCounts = {
  byKind: {},
  narrow: {},
};

/**
 * Server-computed filter OPTIONS with counts, keyed by facet name.
 *
 * Server-computed is not a nicety: deriving "which categories exist" from
 * loaded rows means loading every row, which is the pattern this system
 * replaced. One live account has 34 categories and 773 distinct tags.
 */
export interface EntityFacets {
  byKind: Record<string, { value: string; count: number }[]>;
}

export const EMPTY_FACETS: EntityFacets = { byKind: {} };

/** Count for one facet value, 0 when the facet or value is absent. */
export function facetCount(
  facets: EntityFacets,
  kind: string,
  value: string,
): number {
  return facets.byKind[kind]?.find((v) => v.value === value)?.count ?? 0;
}

/** Options for one facet, most-used first (the RPC already orders them). */
export function facetValues(
  facets: EntityFacets,
  kind: string,
): { value: string; count: number }[] {
  return facets.byKind[kind] ?? [];
}

/**
 * A page of rows plus the TRUE total — not `rows.length`. Every
 * `*_list_scoped` RPC returns `total_count` as a window function over the
 * filtered set, identical on every row.
 */
export interface EntityListPage<TRow> {
  rows: TRow[];
  total: number;
}

/** Sort + paging, handed to the RPC. Style-owned, so it arrives from prefs. */
export interface EntityListSort {
  /**
   * Column id. Free string, not a closed union: every column a surface
   * declares is sortable (app policy), so the valid set is that surface's
   * column registry. The server whitelists it and falls back rather than
   * erroring, so a stale stored value can never break a page.
   */
  sort: string;
  direction: "asc" | "desc";
  /** Pin favorites above every other ordering. */
  favoritesFirst: boolean;
  pageSize: number;
}
