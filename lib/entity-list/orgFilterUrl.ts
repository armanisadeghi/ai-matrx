"use client";

// lib/entity-list/orgFilterUrl.ts
//
// THE ORGANIZATION FILTER'S URL CODEC, for a page that is NOT an
// <EntityListPage> but still lists a person's records (a hand-rolled list, a
// sidebar, a picker page). The shell uses the same param through
// `urlQuery.ts`; this is the standalone face of it:
//
//   const [orgId, setOrgId] = useOrgFilterParam();
//   <EntityOrgFilter orgId={orgId} onChange={setOrgId} />
//   rpc("…_list_scoped", { p_scope: lane, p_org_id: orgId ?? undefined })
//
// The param is `?org_filter=` — absent means All organizations, the default on
// every load. 🚨 Never `?org=` (that one switches the ACTIVE organization), and
// never seeded from, synced with, or written to the active organization
// (common-docs /policies/access-ladder.md).

import { commitUrlParams } from "@ai-matrx/kit/url-state";
import { useListSearchParams } from "./useListSearchParams";
import { ENTITY_LIST_URL_PARAMS } from "./urlQuery";

export const ORG_FILTER_URL_PARAM = ENTITY_LIST_URL_PARAMS.org;

/** The organization filter a query string names; null = All organizations. */
export function readOrgFilter(params: URLSearchParams): string | null {
  return params.get(ORG_FILTER_URL_PARAM) || null;
}

/** The param patch for one filter value (All organizations is absence). */
export function orgFilterPatch(orgId: string | null): Record<string, string | null> {
  return { [ORG_FILTER_URL_PARAM]: orgId || null };
}

/**
 * The organization filter as URL-backed state: survives reload, Back undoes it.
 * `resetParams` names other params a change must clear (usually the page).
 */
export function useOrgFilterParam(
  resetParams: readonly string[] = [ENTITY_LIST_URL_PARAMS.page],
): [string | null, (orgId: string | null) => void] {
  const params = useListSearchParams();
  const setOrgId = (orgId: string | null) => {
    const patch = orgFilterPatch(orgId);
    for (const name of resetParams) patch[name] = null;
    commitUrlParams(patch, "push");
  };
  return [readOrgFilter(params), setOrgId];
}
