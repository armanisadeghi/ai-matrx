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
import { listOrgParam } from "@/lib/list-scope/types";
import type { ShapeBrowseRow } from "./types";
import { readListRpc } from "@/lib/entity-list/readListRpc";
import { postgrestError } from "@/lib/failure/postgrestError";

function pgError(error: { message?: string; code?: string }): Error {
  return postgrestError(error, {
    action: "loading the shapes",
    fallback: "Supabase returned an error with no message.",
  });
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
    p_org_id: listOrgParam(query),
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
  const { data, error } = await readListRpc("shx_list_scope_counts", {
    p_search: query.search.trim() || undefined,
    p_org_id: listOrgParam(query),
    p_deep: query.deep,
    p_filters: filtersJson(query),
  }, { order: ["scope", "narrow_id"] });
  if (error) throw pgError(error);

  const counts = scopeCountsFromRows(data ?? [], "Unnamed organization");
  return counts;
}

export async function fetchShapeFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const { data, error } = await readListRpc("shx_list_facets", {
    p_scope: query.scope.kind,
    p_org_id: listOrgParam(query),
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
  }, { order: ["kind", "value"] });
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

/**
 * One shape by its kind slug, through the SAME canonical reader as the list
 * (`shx_list_scoped`, lane `all`, the `kind` column filter) — so a pinned pick
 * or a locked agent's shape that is not on the current page still carries its
 * label and description. `null` = no shape with exactly that slug is visible.
 */
export async function fetchShapeByKind(kind: string): Promise<ShapeBrowseRow | null> {
  const page = await fetchShapePage(
    {
      scope: { kind: "all" },
      orgId: null,
      search: "",
      deep: false,
      archived: "active",
      filters: { kind: { kind: "text", value: kind } },
      page: 1,
    },
    { sort: "label", direction: "asc", favoritesFirst: false, pageSize: 50 },
  );
  return page.rows.find((row) => row.kind === kind) ?? null;
}
