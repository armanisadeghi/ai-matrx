// features/research/browse/service.ts
//
// The entity-list service triple over the rsx_* scoped-list RPCs
// (`public.rsx_list_scoped` / `rsx_list_scope_counts` / `rsx_list_facets`),
// hand-written from the template in lib/list-scope/FEATURE.md. Sort, every
// column filter, paging, the scope totals and the facet counts all run on the
// server, so the browser only ever holds one page of topics.
//
// The RPCs are SECURITY INVOKER: row security on `research.rs_topic` stays the
// ceiling, and the RPC declares the VIEW (the view law) —
//   mine → topics the person created;
//   orgs → topics an organization they belong to holds (or one, when narrowed).
// Row security alone is NOT a view: a platform admin can read every topic on
// the platform, and "My orgs" must still mean their own organizations.
//
// 🚨 `total` is `total_count` — the filtered total from the same predicate.

import { supabase } from "@/utils/supabase/client";
import type { EntityListService } from "@/lib/entity-list/config";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import { scopeOrgId } from "@/lib/list-scope/types";
import type { ResearchTopicListRow } from "./types";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "The research topics list returned an error with no message.",
  );
}

/**
 * Names by id for the two id-valued facets (project, organization), filled
 * from the facet read. Facet chips and column headers format a VALUE (an id)
 * synchronously, so the service fills this before it returns the facets that
 * name those ids.
 */
const FACET_LABELS = new Map<string, string>();

export function projectLabel(projectId: string): string {
  return FACET_LABELS.get(`project:${projectId}`) ?? "Unnamed project";
}

export function organizationLabel(organizationId: string): string {
  return FACET_LABELS.get(`organization_name:${organizationId}`) ?? "Organization";
}

export const researchTopicListService: EntityListService<ResearchTopicListRow> = {
  async fetchPage(
    query: EntityListQuery,
    sort: EntityListSort,
  ): Promise<EntityListPage<ResearchTopicListRow>> {
    const { data, error } = await supabase.rpc("rsx_list_scoped", {
      p_scope: query.scope.kind,
      p_org_id: scopeOrgId(query.scope) ?? undefined,
      p_search: query.search.trim() || undefined,
      p_sort: sort.sort,
      p_dir: sort.direction,
      p_filters: query.filters,
      p_limit: sort.pageSize,
      p_offset: (query.page - 1) * sort.pageSize,
    });
    if (error) throw pgError(error);
    const rows = data ?? [];
    return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
  },

  async fetchCounts(query: EntityListQuery): Promise<EntityScopeCounts> {
    const { data, error } = await supabase.rpc("rsx_list_scope_counts", {
      p_search: query.search.trim() || undefined,
      p_filters: query.filters,
    });
    if (error) throw pgError(error);
    const counts: EntityScopeCounts = { byKind: {}, narrow: {} };
    for (const row of data ?? []) {
      const kind = row.scope;
      if (kind !== "mine" && kind !== "orgs") continue;
      if (row.narrow_id) {
        (counts.narrow[kind] ??= []).push({
          id: row.narrow_id,
          label: row.label ?? "Organization",
          count: Number(row.total ?? 0),
        });
        continue;
      }
      counts.byKind[kind] = Number(row.total ?? 0);
    }
    counts.narrow.orgs?.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return counts;
  },

  async fetchFacets(query: EntityListQuery): Promise<EntityFacets> {
    const { data, error } = await supabase.rpc("rsx_list_facets", {
      p_scope: query.scope.kind,
      p_org_id: scopeOrgId(query.scope) ?? undefined,
      p_search: query.search.trim() || undefined,
    });
    if (error) throw pgError(error);
    const byKind: EntityFacets["byKind"] = {};
    for (const row of data ?? []) {
      if (row.label) FACET_LABELS.set(`${row.kind}:${row.value}`, row.label);
      (byKind[row.kind] ??= []).push({ value: row.value, count: Number(row.total ?? 0) });
    }
    for (const values of Object.values(byKind)) {
      values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }
    return { byKind };
  },
};
