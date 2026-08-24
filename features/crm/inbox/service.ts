// features/crm/inbox/service.ts
//
// Direct browser → Supabase (CLAUDE.md § Data flow). The entity-list service
// triple over the crm_inbox_* RPC set, plus the one write this surface owns.
//
// There is NO cross-party interaction query anywhere else in the app —
// crm.interaction was read only through fetchPartyDetail. This is the first
// one, and it is a proper scoped RPC rather than a bare RLS-filtered select
// (THE VIEW LAW: a bare RLS-filtered list read is a defect).

import { supabase } from "@/utils/supabase/client";

import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import { scopeOrgId } from "@/lib/list-scope/types";
import type { InteractionRow } from "@/features/crm/types";
import type { InboxRow } from "./types";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

export async function fetchInboxListPage(
  query: EntityListQuery,
  sort: EntityListSort,
): Promise<EntityListPage<InboxRow>> {
  const { data, error } = await supabase.rpc("crm_inbox_list_scoped", {
    p_scope: query.scope.kind,
    p_org_id: scopeOrgId(query.scope) ?? undefined,
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_sort: sort.sort,
    p_dir: sort.direction,
    p_filters: query.filters,
    p_limit: sort.pageSize,
    p_offset: (query.page - 1) * sort.pageSize,
  });

  if (error) throw pgError(error);

  const rows = data ?? [];
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

export async function fetchInboxScopeCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const { data, error } = await supabase.rpc("crm_inbox_list_scope_counts", {
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_filters: query.filters,
  });

  if (error) throw pgError(error);

  const counts: EntityScopeCounts = { byKind: {}, narrow: {} };
  for (const row of data ?? []) {
    const total = Number(row.total ?? 0);
    if (row.scope !== "mine" && row.scope !== "orgs") continue;
    if (row.narrow_id) {
      (counts.narrow[row.scope] ??= []).push({
        id: row.narrow_id,
        label: row.label ?? "Unnamed org",
        count: total,
      });
      continue;
    }
    counts.byKind[row.scope] = total;
  }
  return counts;
}

export async function fetchInboxFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const { data, error } = await supabase.rpc("crm_inbox_list_facets", {
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

/**
 * Mark a reply handled (or put it back in the queue).
 *
 * Goes through the RPC rather than a direct update: `attributes` is a SHARED
 * bag — the send pipeline and the inbound classifier both own keys in it — and
 * a client-side read-modify-write would race them. The RPC merges only the
 * `inbox` sub-object and restates the editor-level reach that crm.interaction's
 * std_update policy requires.
 */
export async function setInboxHandled(
  interactionId: string,
  handled: boolean,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("crm_inbox_set_handled", {
    p_interaction_id: interactionId,
    p_handled: handled,
  });
  if (error) throw pgError(error);
  return data ?? null;
}

/**
 * ONE interaction by id, for a surface that must show the exact message before
 * a human acts on it (the Chasebox's approve-a-draft flow).
 *
 * A single-record read is not what THE VIEW LAW forbids — that rule is about
 * LIST queries leaning on RLS to decide what a page shows. Here RLS is the
 * correct and complete authority: the caller already has the id from a scoped
 * RPC, and a row they cannot see must simply not resolve.
 *
 * Lives here because features/crm/inbox owns every client-side read of
 * crm.interaction; a second reader in the Chasebox would be a second shape for
 * the same table.
 */
export async function fetchInteractionById(
  interactionId: string,
): Promise<InteractionRow | null> {
  const { data, error } = await supabase
    .schema("crm")
    .from("interaction")
    .select("*")
    .eq("id", interactionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw pgError(error);
  return data;
}
