// features/agents/browse/service.ts
//
// Direct browser → Supabase. No Next.js hop, no Python hop: this is a plain DB
// read the browser is entitled to make (CLAUDE.md § Data flow).
//
// Three calls, three jobs:
//   fetchAgentBrowsePage   — the rows for ONE page + the true total
//   fetchBrowseScopeCounts — every scope tab's true total, one round trip
//   fetchBrowseFacets      — the filter panel's options WITH counts
//
// Facets are server-computed on purpose. Deriving "which categories exist"
// from loaded rows means loading every row, which is exactly the pattern this
// page replaced — and at 773 distinct tags it is not a rounding error.

import { supabase } from "@/utils/supabase/client";
import type { AgentBrowseRow, BrowseFacets, BrowseQuery, BrowseScopeCounts } from "./types";
import { EMPTY_FACETS, EMPTY_SCOPE_COUNTS } from "./types";

export interface AgentBrowsePage {
  rows: AgentBrowseRow[];
  /** Total rows matching the query server-side — not `rows.length`. */
  total: number;
}

export interface BrowseSortOpts {
  sort: "updated" | "created" | "name" | "category";
  direction: "asc" | "desc";
  favoritesFirst: boolean;
  pageSize: number;
}

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

/** Empty array → undefined, so the RPC sees NULL ("no filter") not "match nothing". */
function orNull(values: string[]): string[] | undefined {
  return values.length > 0 ? values : undefined;
}

export async function fetchAgentBrowsePage(
  query: BrowseQuery,
  opts: BrowseSortOpts,
): Promise<AgentBrowsePage> {
  const { data, error } = await supabase.rpc("agx_list_scoped", {
    p_scope: query.scope.kind,
    p_org_id: query.scope.organizationId ?? undefined,
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_sort: opts.sort,
    p_dir: opts.direction,
    p_favorites_first: opts.favoritesFirst,
    p_favorites: query.favorites,
    p_archived: query.archived,
    p_categories: orNull(query.categories),
    p_tags: orNull(query.tags),
    p_limit: opts.pageSize,
    p_offset: (query.page - 1) * opts.pageSize,
  });

  if (error) throw pgError(error);

  const rows = (data ?? []) as AgentBrowseRow[];
  // total_count is a window function over the filtered set — identical on every
  // row. Zero rows legitimately means zero matches, not "unknown".
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

export async function fetchBrowseScopeCounts(
  query: BrowseQuery,
): Promise<BrowseScopeCounts> {
  const { data, error } = await supabase.rpc("agx_list_scope_counts", {
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_favorites: query.favorites,
    p_archived: query.archived,
    p_categories: orNull(query.categories),
    p_tags: orNull(query.tags),
  });

  if (error) throw pgError(error);

  const counts: BrowseScopeCounts = { ...EMPTY_SCOPE_COUNTS, byOrg: {} };
  for (const row of data ?? []) {
    const total = Number(row.total ?? 0);
    if (row.org_id) {
      counts.byOrg[row.org_id] = total;
      continue;
    }
    if (
      row.scope === "mine" ||
      row.scope === "orgs" ||
      row.scope === "shared" ||
      row.scope === "public"
    ) {
      counts[row.scope] = total;
    }
  }
  return counts;
}

/**
 * Filter options for the current scope + search. Deliberately NOT narrowed by
 * the category/tag selection itself — a facet list that hides the option you
 * just deselected traps the user in their own filter.
 */
export async function fetchBrowseFacets(
  query: BrowseQuery,
): Promise<BrowseFacets> {
  const { data, error } = await supabase.rpc("agx_list_facets", {
    p_scope: query.scope.kind,
    p_org_id: query.scope.organizationId ?? undefined,
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_archived: query.archived,
  });

  if (error) throw pgError(error);

  const facets: BrowseFacets = {
    categories: [],
    tags: [],
    favoriteCount: 0,
    archivedCount: 0,
  };
  for (const row of data ?? []) {
    const count = Number(row.total ?? 0);
    if (row.kind === "category") facets.categories.push({ value: row.value, count });
    else if (row.kind === "tag") facets.tags.push({ value: row.value, count });
    else if (row.kind === "favorite") facets.favoriteCount = count;
    else if (row.kind === "archived") facets.archivedCount = count;
  }
  // Most-used first: the useful end of a 773-entry tag list is the top of it.
  facets.categories.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  facets.tags.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return facets;
}

export { EMPTY_FACETS };
