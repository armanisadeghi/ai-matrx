// features/mandates/admin-list/service.ts
//
// The entity-list service triple for the admin mandate list, served by the
// DATABASE: `public.mnd_admin_list` scopes, relevance-searches, filters,
// sorts, pages, counts and facets (migrations/mnd_admin_list_server_read_2026_09_24.sql).
// The browser never holds the corpus.
//
// Each page's rows are then built by THE ONE ROW BUILDER (./rows.ts →
// mandate-health.ts `buildRow`) from that page's own definition rows, so a
// cell renders exactly what it always did; the facts only the whole corpus
// knows (customized by, serves, backs count, home name) come from the database
// answer and win.
//
// Scopes (admin list — the creator ruling):
//   mine    created by the viewer
//   orgs    homed in one of the viewer's organizations (narrowable to one)
//   system  homed in the platform's system organization

import type { AppDispatch } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import type { EntityListService } from "@/lib/entity-list/config";
import type {
  EntityListQuery,
  EntityScopeCounts,
  ScopeNarrowOption,
} from "@/lib/entity-list/types";
import { fetchMandateConsoleData } from "@/features/mandates/admin/service";
import { fetchProvisions } from "@/features/mandates/provisions";
import { ALL_FACT_SECTIONS, buildFacts, sectionsFor, type MandateAdminReports } from "./facts";
import {
  callMandateAdminList,
  type MandateAdminCountsAnswer,
  type MandateAdminFacetsAnswer,
  type MandateAdminPageAnswer,
  type MandateAdminPageRow,
} from "./rpc";
import { buildAdminRows } from "./rows";
import {
  ensureMandateAdminReports,
  getMandateAdminListState,
  mergeProvisionOffers,
  recordMandateAdminFailure,
} from "./store";
import type { MandateAdminRow } from "./types";

/** The scope half of every call. */
export function scopeArgs(query: Pick<EntityListQuery, "scope" | "search" | "filters">) {
  const scope = query.scope;
  return {
    p_scope: scope.kind,
    p_org_id:
      scope.kind === "orgs" && scope.organizationId ? scope.organizationId : undefined,
    p_search: query.search.trim() || undefined,
    p_filters: query.filters as unknown as Json,
  };
}

/**
 * Build the rows of one page, in the database's order. A key the page read
 * can no longer see (removed in between) is dropped rather than invented.
 */
async function buildPageRows(
  pageRows: MandateAdminPageRow[],
  reports: MandateAdminReports,
): Promise<MandateAdminRow[]> {
  if (pageRows.length === 0) return [];
  const data = await fetchMandateConsoleData({
    mandateKeys: pageRows.map((row) => row.mandate_key),
  });
  const { failures, settled } = getMandateAdminListState();
  const built = buildAdminRows({
    console: data,
    codeTruth: reports.codeTruth,
    coverage: reports.coverage,
    catalogue: null,
    impact: reports.impact,
    impactFailed: Boolean(failures.impact) || (settled.impact && !reports.impact),
    serveLinks: [],
    organizationNames: {},
    pending: { codeTruth: !settled.codeTruth, coverage: !settled.coverage },
  });
  const byKey = new Map(built.map((row) => [row.mandateKey, row]));
  const rows: MandateAdminRow[] = [];
  for (const answer of pageRows) {
    const row = byKey.get(answer.mandate_key);
    if (!row) continue;
    rows.push({
      ...row,
      customizedBy: answer.customized_by,
      serves: answer.serves as MandateAdminRow["serves"],
      servesDetail: answer.serves_detail,
      backsCount: answer.backs_count,
      homeLabel: answer.home_label,
    });
  }

  // The Inputs cell's offered values — only for this page's provisions.
  const known = getMandateAdminListState().offersByProvision;
  const missing = [
    ...new Set(
      rows.map((row) => row.provisionKey).filter((key): key is string => !!key && !known.has(key)),
    ),
  ];
  if (missing.length > 0) {
    void fetchProvisions(missing)
      .then((offers) => {
        const next = new Map<string, string[]>();
        for (const [key, offer] of offers) next.set(key, offer.values.map((v) => v.name));
        mergeProvisionOffers(next);
      })
      .catch((error: unknown) =>
        recordMandateAdminFailure("inputs", error instanceof Error ? error.message : String(error)),
      );
  }
  return rows;
}

export function countsFromAnswer(answer: MandateAdminCountsAnswer): EntityScopeCounts {
  const options: ScopeNarrowOption[] = answer.orgs_narrow.map((option) => ({
    id: option.id,
    label: option.label,
    count: option.count,
  }));
  return {
    byKind: { mine: answer.mine, orgs: answer.orgs, system: answer.system },
    narrow: options.length > 0 ? { orgs: options } : {},
    ...(options.length === 0
      ? { narrowUnavailable: { orgs: "No organization mandates." } }
      : {}),
  };
}

export function createMandateAdminService(
  dispatch: AppDispatch,
): EntityListService<MandateAdminRow> {
  const reportsNow = () => ensureMandateAdminReports(dispatch);
  return {
    fetchPage: async (query, sort) => {
      const reports = await reportsNow();
      const searching = Boolean(query.search.trim());
      const answer = await callMandateAdminList<MandateAdminPageAnswer>({
        p_mode: "page",
        ...scopeArgs(query),
        p_sort: sort.sort,
        p_dir: sort.direction,
        p_limit: sort.pageSize,
        p_offset: (query.page - 1) * sort.pageSize,
        p_facts: buildFacts(reports, sectionsFor(query, searching ? null : sort.sort)) as Json,
      });
      return { rows: await buildPageRows(answer.rows, reports), total: answer.total };
    },
    fetchCounts: async (query) => {
      const reports = await reportsNow();
      const answer = await callMandateAdminList<MandateAdminCountsAnswer>({
        p_mode: "counts",
        ...scopeArgs(query),
        p_facts: buildFacts(reports, sectionsFor(query)) as Json,
      });
      return countsFromAnswer(answer);
    },
    fetchFacets: async (query) => {
      const reports = await reportsNow();
      const answer = await callMandateAdminList<MandateAdminFacetsAnswer>({
        p_mode: "facets",
        ...scopeArgs(query),
        p_facts: buildFacts(reports, ALL_FACT_SECTIONS) as Json,
      });
      return { byKind: answer };
    },
  };
}
