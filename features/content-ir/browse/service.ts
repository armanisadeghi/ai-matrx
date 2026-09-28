import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import { scopeCountsFromRows } from "@/lib/entity-list/types";
import { scopeOrgId } from "@/lib/list-scope/types";
import type { ShapeBrowseRow } from "./types";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message.",
  );
}

function filtersJson(query: EntityListQuery): Json {
  return query.filters;
}

export async function fetchShapePage(
  query: EntityListQuery,
  sort: EntityListSort,
): Promise<EntityListPage<ShapeBrowseRow>> {
  const { data, error } = await supabase.rpc("shx_list_scoped", {
    p_scope: query.scope.kind,
    p_org_id: scopeOrgId(query.scope) ?? undefined,
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_sort: sort.sort,
    p_dir: sort.direction,
    p_filters: filtersJson(query),
    p_limit: sort.pageSize,
    p_offset: (query.page - 1) * sort.pageSize,
  });
  if (error) throw pgError(error);
  const rows = data ?? [];
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

export async function fetchShapeScopeCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const { data, error } = await supabase.rpc("shx_list_scope_counts", {
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_filters: filtersJson(query),
  });
  if (error) throw pgError(error);

  const counts = scopeCountsFromRows(data ?? [], "Unnamed organization");
  return counts;
}

export async function fetchShapeFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const { data, error } = await supabase.rpc("shx_list_facets", {
    p_scope: query.scope.kind,
    p_org_id: scopeOrgId(query.scope) ?? undefined,
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
  });
  if (error) throw pgError(error);

  const byKind: EntityFacets["byKind"] = {};
  for (const row of data ?? []) {
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
