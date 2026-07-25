// features/agents/browse/service.ts
//
// Direct browser → Supabase. No Next.js hop, no Python hop: this is a plain DB
// read the browser is entitled to make (CLAUDE.md § Data flow).

import { supabase } from "@/utils/supabase/client";
import type {
  AgentBrowseRow,
  BrowseQuery,
  BrowseScopeCounts,
} from "./types";
import { EMPTY_SCOPE_COUNTS } from "./types";

export interface AgentBrowsePage {
  rows: AgentBrowseRow[];
  /** Total rows matching the query server-side — not `rows.length`. */
  total: number;
}

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

export async function fetchAgentBrowsePage(
  query: BrowseQuery,
  opts: {
    sort: "updated" | "created" | "name" | "category";
    direction: "asc" | "desc";
    pageSize: number;
  },
): Promise<AgentBrowsePage> {
  const { data, error } = await supabase.rpc("agx_list_scoped", {
    p_scope: query.scope.kind,
    p_org_id: query.scope.organizationId ?? undefined,
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_sort: opts.sort,
    p_dir: opts.direction,
    p_favorites_only: query.favoritesOnly,
    p_archived: query.archived,
    p_category: query.category ?? undefined,
    p_limit: opts.pageSize,
    p_offset: (query.page - 1) * opts.pageSize,
  });

  if (error) throw pgError(error);

  const rows = (data ?? []) as AgentBrowseRow[];
  // total_count is a window function over the filtered set — identical on every
  // row. Zero rows legitimately means zero matches, not "unknown".
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

/**
 * True totals for every scope tab in ONE round trip, plus a per-org breakdown.
 * Honors the same non-scope filters so a tab's number always equals what
 * clicking that tab actually shows.
 */
export async function fetchBrowseScopeCounts(
  query: BrowseQuery,
): Promise<BrowseScopeCounts> {
  const { data, error } = await supabase.rpc("agx_list_scope_counts", {
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_favorites_only: query.favoritesOnly,
    p_archived: query.archived,
    p_category: query.category ?? undefined,
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
