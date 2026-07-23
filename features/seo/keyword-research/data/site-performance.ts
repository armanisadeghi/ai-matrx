import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

import type {
  SiteKeywordPerformancePage,
  SiteKeywordPerformanceRow,
} from "../types";

const SORT_COLUMNS = new Set<keyof SiteKeywordPerformanceRow>([
  "query",
  "clicks",
  "impressions",
  "ctr",
  "average_position",
  "search_volume",
  "cpc",
  "competition_index",
  "priority_score",
  "top_page_path",
  "last_date",
]);

function cleanSearch(value: string): string {
  return value
    .trim()
    .replace(/[(),"'\\%]/g, " ")
    .trim();
}

function rangeFor(state: MatrxDataTableQueryState) {
  const from = (state.page - 1) * state.pageSize;
  return { from, to: from + state.pageSize - 1 };
}

function applyNumberFilter<
  T extends {
    gte(column: string, value: number): T;
    lte(column: string, value: number): T;
  },
>(query: T, column: string, state: MatrxDataTableQueryState): T {
  const filter = state.columnFilters[column];
  if (filter?.kind !== "number") return query;
  let next = query;
  if (filter.min !== undefined) next = next.gte(column, filter.min);
  if (filter.max !== undefined) next = next.lte(column, filter.max);
  return next;
}

/** Direct read of persisted GSC + market intelligence for one site. */
export async function listSiteKeywordPerformance(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<SiteKeywordPerformancePage> {
  await requireAuthenticatedSupabaseSession(supabase);
  const { from, to } = rangeFor(state);
  let query = supabase
    .schema("seo")
    .from("v_site_keyword_performance")
    .select("*", { count: "exact" })
    .eq("site_id", siteId);

  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `query.ilike.%${search}%,top_page_path.ilike.%${search}%,top_page_url.ilike.%${search}%`,
    );
  }

  const workflow = state.columnFilters.workflow_status;
  if (workflow?.kind === "select" && workflow.value) {
    query = query.eq("workflow_status", workflow.value);
  }
  const competition = state.columnFilters.competition;
  if (competition?.kind === "select" && competition.value) {
    query = query.eq("competition", competition.value);
  }

  for (const column of [
    "clicks",
    "impressions",
    "ctr",
    "average_position",
    "search_volume",
    "cpc",
    "competition_index",
    "priority_score",
  ]) {
    query = applyNumberFilter(query, column, state);
  }

  const sortColumn =
    state.sort &&
    SORT_COLUMNS.has(state.sort.id as keyof SiteKeywordPerformanceRow)
      ? state.sort.id
      : "clicks";
  const response = await query
    .order(sortColumn, {
      ascending: state.sort?.direction === "asc",
      nullsFirst: false,
    })
    .order("impressions", { ascending: false, nullsFirst: false })
    .order("query", { ascending: true })
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);

  if (response.error) throw response.error;
  return {
    rows: response.data ?? [],
    total: response.count ?? 0,
  };
}
