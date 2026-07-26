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

export type FavoritesFilter = "all" | "only" | "exclude";
export type ArchivedFilter = "active" | "archived" | "all";

/**
 * Query half of list state — never persisted, always starts clean.
 * EVERY field here is honored server-side by agx_list_scoped. A filter the
 * server cannot serve does not belong in this shape; it would only ever filter
 * the current page, which is a lie at any scale that matters.
 */
export interface BrowseQuery {
  scope: BrowseScope;
  search: string;
  /** Reach into prompt content. Opt-in — it is a full jsonb scan server-side. */
  deep: boolean;
  favorites: FavoritesFilter;
  archived: ArchivedFilter;
  /** OR-set. `__none__` = uncategorized. Empty = no category filter. */
  categories: string[];
  /** OR-set. `__none__` = untagged. Empty = no tag filter. */
  tags: string[];
  page: number;
}

export const DEFAULT_BROWSE_QUERY: BrowseQuery = {
  scope: DEFAULT_BROWSE_SCOPE,
  search: "",
  deep: false,
  favorites: "all",
  archived: "active",
  categories: [],
  tags: [],
  page: 1,
};

/** How many query fields are narrowing the list right now (badge on Filters). */
export function countActiveFilters(query: BrowseQuery): number {
  return (
    (query.favorites !== "all" ? 1 : 0) +
    (query.archived !== "active" ? 1 : 0) +
    (query.categories.length > 0 ? 1 : 0) +
    (query.tags.length > 0 ? 1 : 0)
  );
}

/** Server-computed filter options for the current scope + search. */
export interface BrowseFacets {
  categories: { value: string; count: number }[];
  tags: { value: string; count: number }[];
  favoriteCount: number;
  archivedCount: number;
}

export const EMPTY_FACETS: BrowseFacets = {
  categories: [],
  tags: [],
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
