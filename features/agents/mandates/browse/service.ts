// features/agents/mandates/browse/service.ts
//
// Direct browser → Supabase (CLAUDE.md § Data flow): the entity-list service
// triple over the mnd_* RPC set (migrations/mnd_list_scoped.sql). The RPC —
// not this file — resolves agent names (SQL join), so the canonical-selection
// law's raw-agent-list ban never comes into play here.
//
// Mandates carry ONE scope (platform rows), no favorites, no archived axis;
// those pieces of the generic query are inert.

import { supabase } from "@/utils/supabase/client";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import type { Json } from "@/types/database.types";
import type { MandateListRow } from "./types";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

/**
 * 🚨 LOCAL RPC TYPING — mnd_* postdates the generated types and the gen CLI
 * currently truncates on regen (see ./types.ts). ONE narrowly-typed seam so
 * every call site stays fully typed; delete with the row-type widening on the
 * next successful `pnpm db-types`.
 */
interface MndRpcMap {
  mnd_list_scoped: {
    args: {
      p_scope: string;
      /** Required by `p_scope: "org"` — WHOSE resolution to compute. */
      p_org_id?: string;
      p_search?: string;
      p_sort: string;
      p_dir: string;
      p_filters: Json;
      p_limit: number;
      p_offset: number;
    };
    row: MandateListRow;
  };
  mnd_list_scope_counts: {
    args: { p_search?: string };
    row: { scope: string; narrow_id: string | null; label: string | null; total: number };
  };
  mnd_list_facets: {
    args: { p_search?: string };
    row: { kind: string; value: string; total: number };
  };
}

async function mndRpc<K extends keyof MndRpcMap>(
  fn: K,
  args: MndRpcMap[K]["args"],
): Promise<MndRpcMap[K]["row"][]> {
  const call = supabase.rpc as unknown as (
    fn: K,
    args: MndRpcMap[K]["args"],
  ) => PromiseLike<{
    data: MndRpcMap[K]["row"][] | null;
    error: { message?: string; code?: string } | null;
  }>;
  const { data, error } = await call(fn, args);
  if (error) throw pgError(error);
  return data ?? [];
}

/**
 * WHOSE resolution the list computes.
 *
 * `mine` — the caller's own funnel (their user binding, then any of their
 * orgs', then the system default). The right answer on /agents/mandates.
 *
 * `org` — the named organization's funnel, personal bindings EXCLUDED. The
 * only honest answer on an org-settings page: an org admin asking "who fulfils
 * this job for my organization" was being shown their own personal override
 * winning, because the page asked for `mine`. Membership is proved inside the
 * RPC; passing an org id you are not in returns nothing.
 */
export type MandateListScope =
  | { kind: "mine" }
  | { kind: "org"; orgId: string };

export const MINE_SCOPE: MandateListScope = { kind: "mine" };

export async function fetchMandateListPage(
  query: EntityListQuery,
  sort: EntityListSort,
  scope: MandateListScope = MINE_SCOPE,
): Promise<EntityListPage<MandateListRow>> {
  const rows = await mndRpc("mnd_list_scoped", {
    p_scope: scope.kind,
    ...(scope.kind === "org" ? { p_org_id: scope.orgId } : {}),
    p_search: query.search.trim() || undefined,
    p_sort: sort.sort,
    p_dir: sort.direction,
    p_filters: query.filters as unknown as Json,
    p_limit: sort.pageSize,
    p_offset: (query.page - 1) * sort.pageSize,
  });
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

/** The list-config service triple for one scope. */
export function mandateListService(scope: MandateListScope) {
  return {
    fetchPage: (query: EntityListQuery, sort: EntityListSort) =>
      fetchMandateListPage(query, sort, scope),
    fetchCounts: fetchMandateScopeCounts,
    fetchFacets: fetchMandateFacets,
  };
}

export async function fetchMandateScopeCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const rows = await mndRpc("mnd_list_scope_counts", {
    p_search: query.search.trim() || undefined,
  });
  const counts: EntityScopeCounts = { byKind: {}, narrow: {} };
  for (const row of rows) {
    if (row.scope === "mine") counts.byKind.mine = Number(row.total ?? 0);
  }
  return counts;
}

export async function fetchMandateFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const rows = await mndRpc("mnd_list_facets", {
    p_search: query.search.trim() || undefined,
  });
  const byKind: EntityFacets["byKind"] = {};
  for (const row of rows) {
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
