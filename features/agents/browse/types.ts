// features/agents/browse/types.ts
//
// The canonical feature-entry list, proven on agents first.
// See ./FEATURE.md for what this is and what becomes reusable.

import type { Database } from "@/types/database.types";

/** One row, exactly as agx_list_scoped returns it. Never hand-mirrored. */
export type AgentBrowseRow =
  Database["public"]["Functions"]["agx_list_scoped"]["Returns"][number];

/**
 * The four canonical destinations of THE VIEW LAW. Each is a distinct
 * question, never an RLS-shaped blur:
 *   mine   — what did I make?
 *   orgs   — what does my team have?
 *   shared — what did someone hand me?
 *   public — what has the platform published?
 */
export type BrowseScopeKind = "mine" | "orgs" | "shared" | "public";

export interface BrowseScope {
  kind: BrowseScopeKind;
  /** Only meaningful for `orgs`. null = all my non-personal orgs blended. */
  organizationId: string | null;
}

export const DEFAULT_BROWSE_SCOPE: BrowseScope = {
  kind: "mine",
  organizationId: null,
};

export type ArchivedFilter = "active" | "archived" | "all";

/**
 * ONE filter vocabulary, shared by the column headers and the Filters panel.
 * Serialized straight into `agx_list_scoped(p_filters)` — so a filter set from
 * a column header and the same filter set from the panel are the same query,
 * and neither can drift into "filters only the current page".
 */
export type BrowseFilterValue =
  | { kind: "text"; value: string }
  | { kind: "select"; values: string[] }
  | { kind: "boolean"; value: boolean };

export type BrowseFilters = Record<string, BrowseFilterValue>;

/** Query half of list state — never persisted, always starts clean. */
export interface BrowseQuery {
  scope: BrowseScope;
  search: string;
  /** Reach into prompt content. Opt-in — it is a full jsonb scan server-side. */
  deep: boolean;
  /**
   * Kept separate from `filters` because it carries a DEFAULT ("active only")
   * rather than being absent-means-unfiltered like every other column.
   */
  archived: ArchivedFilter;
  filters: BrowseFilters;
  page: number;
}

export const DEFAULT_BROWSE_QUERY: BrowseQuery = {
  scope: DEFAULT_BROWSE_SCOPE,
  search: "",
  deep: false,
  archived: "active",
  filters: {},
  page: 1,
};

/** How many things are narrowing the list right now (badge on Filters). */
export function countActiveFilters(query: BrowseQuery): number {
  return Object.keys(query.filters).length + (query.archived !== "active" ? 1 : 0);
}

/** Server-computed filter options for the current scope + search. */
export interface BrowseFacets {
  /** facet kind → values with counts, most-used first. */
  byKind: Record<string, { value: string; count: number }[]>;
  favoriteCount: number;
  archivedCount: number;
}

export const EMPTY_FACETS: BrowseFacets = {
  byKind: {},
  favoriteCount: 0,
  archivedCount: 0,
};

/** True totals from agx_list_scope_counts, per tab + per org chip. */
export interface BrowseScopeCounts {
  mine: number;
  orgs: number;
  shared: number;
  public: number;
  /** organizationId → count, for the My Orgs dropdown. */
  byOrg: Record<string, number>;
}

export const EMPTY_SCOPE_COUNTS: BrowseScopeCounts = {
  mine: 0,
  orgs: 0,
  shared: 0,
  public: 0,
  byOrg: {},
};

/** Fields the table can write back inline. */
export interface AgentRowEdit {
  name?: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
}
