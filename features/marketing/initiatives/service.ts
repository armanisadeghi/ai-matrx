import { supabase } from "@/utils/supabase/client";
import { guardedUpdate } from "@/utils/supabase/guardedUpdate";
import type { Database } from "@/types/database.types";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import { scopeOrgId } from "@/lib/list-scope/types";
import type {
  Initiative,
  InitiativeInsert,
  InitiativeListRow,
  InitiativeUpdate,
} from "./types";

const db = supabase.schema("marketing");
const COLUMNS =
  "id,name,description,brand_id,status,objective,goal,starts_on,ends_on,budget_amount,budget_currency,details,organization_id,created_by,updated_by,created_at,updated_at,deleted_at,version,metadata,visibility";

export async function fetchInitiativeListPage(
  query: EntityListQuery,
  sort: EntityListSort,
): Promise<EntityListPage<InitiativeListRow>> {
  const { data, error } = await supabase.rpc("mkt_initiative_list_scoped", {
    p_scope: query.scope.kind,
    p_org_id: scopeOrgId(query.scope) ?? undefined,
    p_search: query.search || undefined,
    p_deep: query.deep,
    p_sort: sort.sort,
    p_dir: sort.direction,
    p_filters: query.filters,
    p_limit: sort.pageSize,
    p_offset: (query.page - 1) * sort.pageSize,
  });
  if (error) throw error;
  const rows = data ?? [];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function fetchInitiativeScopeCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const { data, error } = await supabase.rpc(
    "mkt_initiative_list_scope_counts",
    {
      p_search: query.search || undefined,
      p_deep: query.deep,
      p_filters: query.filters,
    },
  );
  if (error) throw error;
  const byKind: EntityScopeCounts["byKind"] = {};
  const narrow: EntityScopeCounts["narrow"] = {};
  for (const row of data ?? [])
    byKind[row.scope as keyof typeof byKind] = Number(row.total);
  return { byKind, narrow };
}

export async function fetchInitiativeFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const { data, error } = await supabase.rpc("mkt_initiative_list_facets", {
    p_scope: query.scope.kind,
    p_org_id: scopeOrgId(query.scope) ?? undefined,
    p_search: query.search || undefined,
    p_deep: query.deep,
    p_filters: query.filters,
  });
  if (error) throw error;
  const byKind: EntityFacets["byKind"] = {};
  for (const row of data ?? [])
    (byKind[row.facet] ??= []).push({
      value: row.value,
      count: Number(row.total),
    });
  return { byKind };
}

export async function getInitiative(id: string): Promise<Initiative | null> {
  const { data, error } = await db
    .from("initiative")
    .select(COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createInitiative(
  input: InitiativeInsert,
): Promise<Initiative> {
  const { data, error } = await db
    .from("initiative")
    .insert(input)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateInitiative(
  row: Initiative,
  patch: InitiativeUpdate,
): Promise<Initiative> {
  const result = await guardedUpdate<Initiative>({
    expectedVersion: row.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("initiative")
        .update({ ...patch, version: nextVersion })
        .eq("id", row.id)
        .eq("version", expectedVersion)
        .select(COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("initiative")
        .select(COLUMNS)
        .eq("id", row.id)
        .is("deleted_at", null)
        .maybeSingle(),
  });
  if (result.status === "saved") return result.row;
  if (result.status === "conflict")
    throw new Error(
      "This initiative changed elsewhere. Refresh it before saving your edits.",
    );
  throw new Error("This initiative no longer exists.");
}

export async function saveInitiativeRowEdit(
  row: InitiativeListRow,
  edit: Partial<InitiativeListRow>,
): Promise<void> {
  const allowed: InitiativeUpdate = {};
  if (edit.name !== undefined) allowed.name = edit.name;
  if (edit.status !== undefined) allowed.status = edit.status;
  if (edit.objective !== undefined) allowed.objective = edit.objective;
  if (edit.goal !== undefined) allowed.goal = edit.goal;
  await updateInitiative(row, allowed);
}
