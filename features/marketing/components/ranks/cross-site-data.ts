/**
 * Scoped, server-paged data boundary for `/marketing/ranks`.
 *
 * THE VIEW LAW: `seo_rank_target_list_scoped` owns the explicit Mine / My
 * Orgs / Shared / Public predicates. It returns one controlled page plus the
 * true filtered total; the browser never reads a bare RLS-shaped portfolio.
 */

import { supabase } from "@/utils/supabase/client";
import { makeAssertData } from "@/utils/errors";
import type { Database } from "@/types/database.types";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import { scopeOrgId } from "@/lib/list-scope/types";

/** Sparkline / movement window, mirrored by the scoped RPC. */
export const RANK_HISTORY_DAYS = 90;

type RankListRpcRow =
  Database["public"]["Functions"]["seo_rank_target_list_scoped"]["Returns"][number];

export type CrossSiteRankRow = Omit<
  RankListRpcRow,
  "history_observed_at" | "history_organic_rank"
> & {
  /** Oldest → newest observations inside the 90-day server window. */
  history: Array<{ observed_at: string; organic_rank: number | null }>;
};

const assertData = makeAssertData("reach your rank tracking portfolio");

function toRankRow(row: RankListRpcRow): CrossSiteRankRow {
  const history = row.history_observed_at.map((observed_at, index) => ({
    observed_at,
    organic_rank: row.history_organic_rank[index] ?? null,
  }));
  const { history_observed_at: _times, history_organic_rank: _ranks, ...rest } =
    row;
  return { ...rest, history };
}

export async function fetchCrossSiteRankPage(
  query: EntityListQuery,
  sort: EntityListSort,
): Promise<EntityListPage<CrossSiteRankRow>> {
  const args = {
    p_scope: query.scope.kind,
    p_org_id: scopeOrgId(query.scope) ?? undefined,
    p_search: query.search.trim() || undefined,
    p_sort: sort.sort,
    p_dir: sort.direction,
    p_filters: query.filters,
    p_limit: sort.pageSize,
    p_offset: (query.page - 1) * sort.pageSize,
  };
  const response = await supabase.rpc("seo_rank_target_list_scoped", args);
  const data = assertData(response.data, response.error);
  if (data.length === 0 && query.page > 1) {
    const probe = await supabase.rpc("seo_rank_target_list_scoped", {
      ...args,
      p_limit: 1,
      p_offset: 0,
    });
    const probeData = assertData(probe.data, probe.error);
    return { rows: [], total: Number(probeData[0]?.total_count ?? 0) };
  }
  return {
    rows: data.map(toRankRow),
    total: data.length > 0 ? Number(data[0].total_count) : 0,
  };
}

export async function fetchCrossSiteRankCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const response = await supabase.rpc("seo_rank_target_list_scope_counts", {
    p_search: query.search.trim() || undefined,
    p_filters: query.filters,
  });
  const data = assertData(response.data, response.error);
  const counts: EntityScopeCounts = { byKind: {}, narrow: {} };

  for (const row of data) {
    if (
      row.scope !== "mine" &&
      row.scope !== "orgs" &&
      row.scope !== "shared" &&
      row.scope !== "public"
    ) {
      continue;
    }
    const total = Number(row.total ?? 0);
    if (row.narrow_id) {
      (counts.narrow[row.scope] ??= []).push({
        id: row.narrow_id,
        label: row.label ?? "Organization",
        count: total,
      });
    } else {
      counts.byKind[row.scope] = total;
    }
  }
  return counts;
}

export async function fetchCrossSiteRankFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const response = await supabase.rpc("seo_rank_target_list_facets", {
    p_scope: query.scope.kind,
    p_org_id: scopeOrgId(query.scope) ?? undefined,
    p_search: query.search.trim() || undefined,
  });
  const data = assertData(response.data, response.error);
  const byKind: EntityFacets["byKind"] = {};
  for (const row of data) {
    (byKind[row.kind] ??= []).push({
      value: row.value,
      count: Number(row.total ?? 0),
    });
  }
  for (const values of Object.values(byKind)) {
    values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return { byKind };
}
