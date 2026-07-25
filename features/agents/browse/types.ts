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

/** Query half of list state — never persisted, always starts clean. */
export interface BrowseQuery {
  scope: BrowseScope;
  search: string;
  /** Reach into prompt content. Opt-in — it is a full jsonb scan server-side. */
  deep: boolean;
  favoritesOnly: boolean;
  archived: "active" | "archived" | "all";
  category: string | null;
  page: number;
}

export const DEFAULT_BROWSE_QUERY: BrowseQuery = {
  scope: DEFAULT_BROWSE_SCOPE,
  search: "",
  deep: false,
  favoritesOnly: false,
  archived: "active",
  category: null,
  page: 1,
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
