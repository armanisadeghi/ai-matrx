// features/mandates/browse/service.ts
//
// Direct browser → Supabase (CLAUDE.md § Data flow): the entity-list service
// triple for the two mandate LIST surfaces. Every row and every count comes
// from the ONE list door (`features/mandates/list-door.ts` →
// `public.mnd_list_scoped`), which owns both parameters — OWNERSHIP (`p_home`)
// and RESOLUTION (`p_resolution_for`). Nothing here resolves a rung, derives a
// home, or re-implements a predicate.
//
// TWO MODES, because the two surfaces ask different questions:
//   `homes`        /mandates. The OWNERSHIP tab picks the home; the ladder is
//                  always resolved for the caller in their ACTIVE organization
//                  (D-R1), whichever home is on screen.
//   `organization` an organization's own settings page. The home stays the
//                  caller's full corpus — an org's admins must see the
//                  platform's jobs to bind them — while the RESOLUTION is that
//                  organization's, so the page answers for every member rather
//                  than showing the admin their own personal override winning.

import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
  ScopeNarrowOption,
} from "@/lib/entity-list/types";
import type { ListScope } from "@/lib/list-scope/types";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import {
  ALL_HOMES,
  ORGS_HOME,
  SYSTEM_HOME,
  countMandatesInHome,
  listMandatesScoped,
  orgHome,
  type MandateHome,
} from "@/features/mandates/list-door";
import type { MandateListRow } from "./types";
import { fetchCandidateCells } from "@/features/mandates/candidates/live";
import { readListRpc } from "@/lib/entity-list/readListRpc";

/** One organization the caller belongs to — a own organization included. */
export interface MandateHomeOrganization {
  id: string;
  name: string;
}

export type MandateListMode =
  | {
      kind: "homes";
      /** Every organization the caller belongs to, in tab order. */
      organizations: readonly MandateHomeOrganization[];
      /**
       * The membership read has not answered yet.
       *
       * 🚨 IT IS NOT THE SAME AS "belongs to none" (FIX-R6/F1). An empty list
       * during the first render is what silently emptied the Organization
       * section on production `/mandates`; the counts now SAY which of the two
       * states they are in, and the shell re-asks when this flips.
       */
      organizationsLoading?: boolean;
      /** The membership read's own failure, in its words. */
      organizationsError?: string | null;
      /** Whether the door will accept `p_home => 'system'` from this caller. */
      canListSystemHome: boolean;
    }
  | {
      kind: "organization";
      organizationId: string;
    };

/**
 * The home a LANE is asking for: All = the platform's own jobs plus every organization the caller
 * belongs to; My Orgs = only the organizations the caller belongs to; System = the platform's own.
 * One organization is the page's organization filter (`query.orgId` → `p_org_id`, which narrows every
 * lane) — never a lane's and never the active organization.
 */
export function homeForScope(scope: ListScope): MandateHome {
  if (scope.kind === "system") return SYSTEM_HOME;
  if (scope.kind === "orgs") return ORGS_HOME;
  return ALL_HOMES;
}

/**
 * Narrow the page to one coverage state, server-side.
 *
 * The classification stays where it belongs (aidream's coverage.py, reached via
 * GET /mandates/coverage/states); what crosses into SQL is only the KEY LIST
 * that server already classified. Re-deriving green/orange/red in the RPC would
 * be a second implementation of the rule, and the two would drift.
 *
 * A bucket with no mandates in it must show an EMPTY list, never every row —
 * hence the sentinel, which no mandate key can equal.
 */
const NO_MANDATE_MATCHES = "__no_mandate__";

export interface MandateCoverageNarrowing {
  bucket: string;
  keys: string[];
}

export function withCoverageKeys(
  filters: EntityListQuery["filters"],
  coverage: MandateCoverageNarrowing | null,
): Json {
  if (!coverage) return filters as unknown as Json;
  return {
    ...filters,
    coverage_keys: {
      kind: "select",
      values: coverage.keys.length > 0 ? coverage.keys : [NO_MANDATE_MATCHES],
    },
  } as unknown as Json;
}

export async function fetchMandateListPage(
  query: EntityListQuery,
  sort: EntityListSort,
  mode: MandateListMode,
  coverage: MandateCoverageNarrowing | null = null,
): Promise<EntityListPage<MandateListRow>> {
  const rows = await listMandatesScoped({
    ...(mode.kind === "organization"
      ? { resolutionFor: "org" as const, organizationId: mode.organizationId }
      : {
          home: homeForScope(query.scope),
          resolutionFor: "mine" as const,
          // The page's ORGANIZATION FILTER — a list read never carries the active organization.
          organizationId: query.orgId,
        }),
    search: query.search.trim() || undefined,
    sort: sort.sort,
    dir: sort.direction,
    filters: withCoverageKeys(query.filters, coverage),
    limit: sort.pageSize,
    offset: (query.page - 1) * sort.pageSize,
  });
  return {
    rows: await withCandidates(rows),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
  };
}

/**
 * The page's open candidates (Mandate Candidates, V1 D4) — the SAME cell every
 * mandate list shows, for the page's rows only. A failed read leaves the column
 * at "—" and says why in the console; it never fails the list.
 */
async function withCandidates(rows: MandateListRow[]): Promise<MandateListRow[]> {
  if (rows.length === 0) return rows;
  try {
    const cells = await fetchCandidateCells(rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, candidate: cells[row.id] ?? null }));
  } catch (error: unknown) {
    console.error("[mandate list] candidate counts unread:", error);
    return rows;
  }
}

/**
 * True counts per OWNERSHIP tab, each from the door's own `total_count` — so
 * the number on a tab and the rows behind it can never disagree.
 *
 * A home whose count fails is LEFT OUT rather than shown as 0: a zero pill on
 * an organization that has mandates is a lie, and the failure is recorded
 * where the shell's own counts handler can see it.
 */
export async function fetchMandateScopeCounts(
  query: EntityListQuery,
  mode: MandateListMode,
): Promise<EntityScopeCounts> {
  const search = query.search.trim() || undefined;
  const filters = query.filters as unknown as Json;

  if (mode.kind === "organization") {
    const total = await countMandatesInHome(ALL_HOMES, {
      resolutionFor: "org",
      organizationId: mode.organizationId,
      search,
      filters,
    });
    // No narrowing options: this page is ABOUT one organization, fixed by the
    // route, so a dropdown offering to switch away from it would be a control
    // that changes nothing. It SAYS that, rather than showing an empty
    // Organization section the reader has to interpret (FIX-R6/F1).
    return {
      byKind: { orgs: total },
      narrow: {},
      narrowUnavailable: {
        orgs: "This page is about one organization, fixed by its address, so there is no other home to narrow to. Your own page at /mandates narrows across every organization you belong to.",
      },
    };
  }

  // Each lane's badge is the door's own `total_count` for that lane's home, under the page's
  // organization filter — so a badge and the rows behind it cannot disagree.
  const shared = {
    resolutionFor: "mine" as const,
    organizationId: query.orgId,
    search,
    filters,
  };
  const lanes: { kind: "all" | "orgs" | "system"; home: MandateHome }[] = [
    { kind: "all", home: ALL_HOMES },
    { kind: "orgs", home: ORGS_HOME },
    ...(mode.canListSystemHome
      ? [{ kind: "system" as const, home: SYSTEM_HOME }]
      : []),
  ];
  // The organization filter's per-organization numbers (`narrow.all`): counted across every
  // organization on purpose, so each option shows what choosing it would list.
  const perOrg = mode.organizations.map((organization) => ({
    organization,
    home: orgHome(organization.id),
  }));
  const [laneResults, orgResults] = await Promise.all([
    Promise.allSettled(lanes.map((lane) => countMandatesInHome(lane.home, shared))),
    Promise.allSettled(
      perOrg.map((entry) =>
        countMandatesInHome(entry.home, { ...shared, organizationId: null }),
      ),
    ),
  ]);

  const counts: EntityScopeCounts = { byKind: {}, narrow: {} };
  laneResults.forEach((result, index) => {
    if (result.status === "rejected") {
      // A lane whose count fails is left without a number rather than shown as 0.
      console.error(
        `[mandates] the list door refused a count for the ${lanes[index].kind} lane — it is listed without a number rather than with a wrong one.`,
        result.reason,
      );
      return;
    }
    counts.byKind[lanes[index].kind] = result.value;
  });
  const narrowed: ScopeNarrowOption[] = [];
  orgResults.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `[mandates] the list door refused a count for organization ${perOrg[index].organization.id}.`,
        result.reason,
      );
      return;
    }
    narrowed.push({
      id: perOrg[index].organization.id,
      label: perOrg[index].organization.name,
      count: result.value,
    });
  });
  if (narrowed.length > 0) counts.narrow.all = narrowed;
  return counts;
}

/**
 * Facet options. `mnd_list_facets` takes only a search term, so its counts are
 * computed over the caller's full corpus rather than the ownership tab in
 * front of them — a filter option can therefore carry a count larger than the
 * tab holds. Scoping it needs the same `p_home` parameter the list door grew;
 * tracked in FOUND_DEFECTS.md.
 */
export async function fetchMandateFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const { data, error } = await readListRpc("mnd_list_facets", {
    ...(query.search.trim() ? { p_search: query.search.trim() } : {}),
  }, { order: ["kind", "value"] });
  if (error) throw new Error(error.message);
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

/** The list-config service triple for one surface. */
export function mandateListService(
  mode: MandateListMode,
  coverage: MandateCoverageNarrowing | null = null,
) {
  return {
    fetchPage: (query: EntityListQuery, sort: EntityListSort) =>
      fetchMandateListPage(query, sort, mode, coverage),
    fetchCounts: (query: EntityListQuery) =>
      fetchMandateScopeCounts(query, mode),
    fetchFacets: fetchMandateFacets,
  };
}
