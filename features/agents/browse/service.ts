// features/agents/browse/service.ts
//
// Direct browser → Supabase. No Next.js hop, no Python hop: this is a plain DB
// read the browser is entitled to make (CLAUDE.md § Data flow).
//
// Four calls, four jobs:
//   fetchAgentBrowsePage   — the rows for ONE page + the true total
//   fetchBrowseScopeCounts — every scope tab's true total, one round trip
//   fetchBrowseFacets      — filter OPTIONS with counts for every finite column
//   saveAgentRowEdits      — inline table edits, one statement per row
//
// Facets are server-computed on purpose. Deriving "which categories exist"
// from loaded rows means loading every row, which is exactly the pattern this
// page replaced — and at 773 distinct tags it is not a rounding error.

import { supabase } from "@/utils/supabase/client";
import type { Database, Json } from "@/types/database.types";
import type {
  AgentBrowseRow,
  AgentRowEdit,
  BrowseFacets,
  BrowseQuery,
  BrowseScopeCounts,
} from "./types";
import { EMPTY_FACETS, EMPTY_SCOPE_COUNTS } from "./types";

export interface AgentBrowsePage {
  rows: AgentBrowseRow[];
  /** Total rows matching the query server-side — not `rows.length`. */
  total: number;
}

export interface BrowseSortOpts {
  sort: string;
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

/** The filter bag as the RPC wants it. Empty object = no column filters. */
function filtersJson(query: BrowseQuery): Json {
  return query.filters as unknown as Json;
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
    p_archived: query.archived,
    p_filters: filtersJson(query),
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
    p_archived: query.archived,
    p_filters: filtersJson(query),
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
 * Filter options for every finite-valued column, for the current scope +
 * search. Deliberately NOT narrowed by the column selection itself — a facet
 * list that hides the option you just deselected traps the user in their own
 * filter.
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

  const byKind: BrowseFacets["byKind"] = {};
  let favoriteCount = 0;
  let archivedCount = 0;

  for (const row of data ?? []) {
    const count = Number(row.total ?? 0);
    if (row.kind === "favorite") {
      favoriteCount = count;
      continue;
    }
    if (row.kind === "archived") {
      archivedCount = count;
      continue;
    }
    (byKind[row.kind] ??= []).push({ value: row.value, count });
  }

  // Most-used first: the useful end of a 773-entry tag list is the top of it.
  for (const values of Object.values(byKind)) {
    values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }

  return { byKind, favoriteCount, archivedCount };
}

/**
 * Persist inline table edits. One UPDATE per row — these are 1-4 scalar fields
 * on a row the user can see, not a bulk job.
 *
 * Writes go direct to `agent.definition` (RLS-authorized). The agent Redux
 * slice is deliberately NOT involved: this surface holds its own rows rather
 * than hydrating hundreds of agents into the store, so a slice round-trip would
 * buy nothing and its optimistic rollback would have nothing to roll back.
 */
export async function saveAgentRowEdits(
  agentId: string,
  edit: AgentRowEdit,
): Promise<void> {
  // Typed against the generated table Update shape — never a loose bag.
  const patch: Database["agent"]["Tables"]["definition"]["Update"] = {};
  if (edit.name !== undefined) patch.name = edit.name.trim();
  if (edit.description !== undefined)
    patch.description = edit.description?.trim() || null;
  if (edit.category !== undefined) patch.category = edit.category || null;
  if (edit.tags !== undefined) patch.tags = edit.tags;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .schema("agent")
    .from("definition")
    .update(patch)
    .eq("id", agentId);

  if (error) throw pgError(error);
}

export { EMPTY_FACETS };
