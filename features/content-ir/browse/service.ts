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
 * The one-line description of each shape (`kind_definition.metadata.description`)
 * for a page of rows — the Shapes list RPC does not return it. Returns
 * `{ id → description }` for the shapes that have one; a failed read throws.
 */
export async function fetchShapeDescriptions(
  ids: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id,metadata")
    .in("id", [...ids])
    .is("deleted_at", null);
  if (error) throw pgError(error);
  for (const row of data ?? []) {
    const meta = row.metadata;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const description = (meta as Record<string, Json | undefined>).description;
      if (typeof description === "string" && description.trim()) {
        out.set(row.id, description.trim());
      }
    }
  }
  return out;
}
