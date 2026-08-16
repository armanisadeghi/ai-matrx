// features/vision-interview/browse/service.ts
//
// Direct browser → Supabase for the /vision-interview list page (the
// entity-list service triple over the ivw_* RPCs in
// migrations/ivw_list_scoped.sql).
//
// RPC TYPING NOTE: the ivw_* functions are not yet in the generated database
// types (migration applied by the orchestrator; `pnpm db-types` cannot run in
// this container), so the rpc names/args are cast — same precedent as the
// untyped callApi paths. Remove the casts once types regenerate.

import { supabase } from "@/utils/supabase/client";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import { scopeOrgId } from "@/lib/list-scope/types";
import type { SessionListRow } from "./types";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message.",
  );
}

interface CountRow {
  scope: string;
  narrow_id: string | null;
  label: string | null;
  total: number | null;
}

interface FacetRow {
  kind: string;
  value: string;
  total: number | null;
}

export async function fetchSessionPage(
  query: EntityListQuery,
  sort: EntityListSort,
): Promise<EntityListPage<SessionListRow>> {
  const { data, error } = await supabase.rpc(
    "ivw_list_scoped" as never,
    {
      p_scope: query.scope.kind,
      p_org_id: scopeOrgId(query.scope) ?? undefined,
      p_search: query.search.trim() || undefined,
      p_sort: sort.sort,
      p_dir: sort.direction,
      p_filters: query.filters,
      p_limit: sort.pageSize,
      p_offset: (query.page - 1) * sort.pageSize,
    } as never,
  );
  if (error) throw pgError(error);
  const rows = (data ?? []) as unknown as SessionListRow[];
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

export async function fetchSessionScopeCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const { data, error } = await supabase.rpc(
    "ivw_list_scope_counts" as never,
    {
      p_search: query.search.trim() || undefined,
      p_filters: query.filters,
    } as never,
  );
  if (error) throw pgError(error);

  const counts: EntityScopeCounts = { byKind: {}, narrow: {} };
  for (const row of ((data ?? []) as unknown as CountRow[])) {
    const total = Number(row.total ?? 0);
    const kind = row.scope;
    if (kind !== "mine" && kind !== "orgs" && kind !== "shared" && kind !== "public") {
      continue;
    }
    if (row.narrow_id) {
      (counts.narrow[kind] ??= []).push({
        id: row.narrow_id,
        label: row.label ?? "Unnamed",
        count: total,
      });
      continue;
    }
    counts.byKind[kind] = total;
  }
  return counts;
}

export async function fetchSessionFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const { data, error } = await supabase.rpc(
    "ivw_list_facets" as never,
    {
      p_scope: query.scope.kind,
      p_org_id: scopeOrgId(query.scope) ?? undefined,
      p_search: query.search.trim() || undefined,
    } as never,
  );
  if (error) throw pgError(error);

  const byKind: EntityFacets["byKind"] = {};
  for (const row of ((data ?? []) as unknown as FacetRow[])) {
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
