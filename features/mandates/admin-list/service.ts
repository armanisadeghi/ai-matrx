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
// knows (customized by, serves, backs count, home name, contract) come from
// the database answer and win.
//
// ONE CALL PER PAGE (2026-09-25): the page answer carries its own definition
// rows, bindings and holders (`console`), so the first rows paint from that
// single request — no follow-up definitions/bindings/agents reads. The
// code-scan cells (Declared in, Called from, Call sites, Language) are read
// for the page's keys AFTER the paint (./store.ts `ensureMandateSourceFacts`).
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
import {
  fetchMandateConsoleData,
  mandateAgentInfoOf,
  type MandateAgentInfo,
  type MandateConsoleData,
  type MandateVersionInfo,
  type MandateWorkflowInfo,
} from "@/features/mandates/admin/service";
import { fetchProvisions } from "@/features/mandates/provisions";
import { ALL_FACT_SECTIONS, buildFacts, sectionsFor, type MandateAdminReports } from "./facts";
import {
  callMandateAdminList,
  type MandateAdminCountsAnswer,
  type MandateAdminFacetsAnswer,
  type MandateAdminPageAnswer,
  type MandateAdminPageConsole,
  type MandateAdminPageRow,
} from "./rpc";
import { buildAdminRows } from "./rows";
import {
  ensureMandateAdminReports,
  ensureMandateSourceFacts,
  getMandateAdminDbEpoch,
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
 * THE DATABASE HALF, REUSED WHILE ONLY THE REPORTS MOVED.
 *
 * Each aidream report that lands bumps the store's `version`, and the shell
 * re-asks the page. Without this the re-ask threw away the database read in
 * flight and started it again — so the first rows could not paint until the
 * last report had landed (measured 2026-09-25: rows at ~3.2 s after a 0.5 s
 * page read). A read is reused when the same arguments are asked again and
 * EITHER it is still in flight (identical concurrent asks share one read) OR a
 * report has landed since (`version` moved) with no write in between
 * (`dbEpoch` unchanged). A refresh at the same version, or any write, reads the
 * database again.
 */
interface DbRead<T> {
  promise: Promise<T>;
  epoch: number;
  version: number;
  settled: boolean;
}
const dbReads = new Map<string, DbRead<unknown>>();

export function readDbOnce<T>(key: string, read: () => Promise<T>): Promise<T> {
  const epoch = getMandateAdminDbEpoch();
  const version = getMandateAdminListState().version;
  const held = dbReads.get(key) as DbRead<T> | undefined;
  if (held && held.epoch === epoch && (!held.settled || version > held.version)) {
    held.version = version;
    return held.promise;
  }
  const entry: DbRead<T> = { promise: read(), epoch, version, settled: false };
  entry.promise.then(
    () => {
      entry.settled = true;
    },
    () => {
      // A failed read is never reused.
      if (dbReads.get(key) === entry) dbReads.delete(key);
    },
  );
  dbReads.set(key, entry as DbRead<unknown>);
  // Bounded: a visit asks a handful of distinct pages; the oldest go first.
  if (dbReads.size > 24) dbReads.delete(dbReads.keys().next().value as string);
  return entry.promise;
}

/**
 * The page answer's own rows → the console shape the ONE ROW BUILDER reads —
 * the same post-processing `fetchMandateConsoleData` does over its reads.
 */
export function consoleDataFromPage(page: MandateAdminPageConsole): MandateConsoleData {
  const agentsById: Record<string, MandateAgentInfo> = {};
  const outputSchemas: Record<string, unknown> = {};
  for (const row of page.agents) {
    agentsById[row.id] = mandateAgentInfoOf(row);
    // Present-with-null is the honest "declares none"; an agent this read could
    // not return stays ABSENT so its verdict stays UNKNOWN.
    outputSchemas[row.id] = row.output_schema ?? null;
  }
  const versionsById: Record<string, MandateVersionInfo> = {};
  for (const row of page.versions) {
    versionsById[row.id] = {
      id: row.id,
      agentId: row.agent_id,
      versionNumber: row.version_number,
      name: row.name,
    };
  }
  const workflowsById: Record<string, MandateWorkflowInfo> = {};
  for (const row of page.workflows) {
    workflowsById[row.id] = { id: row.id, name: row.name, isArchived: row.is_archived === true };
  }
  const workflowVersionsById: NonNullable<MandateConsoleData["workflowVersionsById"]> = {};
  for (const row of page.workflow_versions) {
    workflowVersionsById[row.id] = {
      id: row.id,
      workflowId: row.definition_id,
      versionNumber: row.version_number,
    };
  }
  const bindingsByMandateId: MandateConsoleData["bindingsByMandateId"] = {};
  for (const binding of page.bindings) {
    (bindingsByMandateId[binding.mandate_id] ??= []).push(binding);
  }
  return {
    mandates: [...page.mandates].sort((a, b) => a.mandate_key.localeCompare(b.mandate_key)),
    agentsById,
    versionsById,
    bindingsByMandateId,
    outputSchemas,
    workflowsById,
    workflowVersionsById,
  };
}

/**
 * Build the rows of one page, in the database's order, from the reports as
 * they stand. A key the page read can no longer see (removed in between) is
 * dropped rather than invented.
 */
function buildPageRows(
  pageRows: MandateAdminPageRow[],
  data: MandateConsoleData,
  reports: MandateAdminReports,
): MandateAdminRow[] {
  if (pageRows.length === 0) return [];
  const { failures, settled } = getMandateAdminListState();
  const built = buildAdminRows({
    console: data,
    codeTruth: reports.codeTruth,
    coverage: reports.coverage,
    catalogue: null,
    impact: reports.impact,
    impactFailed: Boolean(failures.impact) || (settled.impact && !reports.impact),
    workflowImpact: reports.workflowImpact,
    serveLinks: [],
    organizationNames: {},
    pending: { codeTruth: !settled.codeTruth, coverage: !settled.coverage },
  });
  const byKey = new Map(built.map((row) => [row.mandateKey, row]));
  const listState = getMandateAdminListState();
  const rows: MandateAdminRow[] = [];
  for (const answer of pageRows) {
    const row = byKey.get(answer.mandate_key);
    if (!row) continue;
    const checked = listState.sourceChecked.has(answer.mandate_key);
    rows.push({
      ...row,
      customizedBy: answer.customized_by,
      serves: answer.serves as MandateAdminRow["serves"],
      servesDetail: answer.serves_detail,
      backsCount: answer.backs_count,
      homeLabel: answer.home_label,
      contractCheck: answer.contract_check ?? row.contractCheck,
      sources: listState.sourceFacts.get(answer.mandate_key) ?? null,
      sourcesPending: !checked,
      sourcesFailed: checked && Boolean(listState.failures.sources),
    });
  }
  // The code-scan cells: read for this page's keys, after the paint.
  ensureMandateSourceFacts(rows.map((row) => row.mandateKey));

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
      const args = {
        p_mode: "page",
        ...scopeArgs(query),
        p_sort: sort.sort,
        p_dir: sort.direction,
        p_limit: sort.pageSize,
        p_offset: (query.page - 1) * sort.pageSize,
        p_facts: buildFacts(reports, sectionsFor(query, searching ? null : sort.sort)) as Json,
      };
      // ONE database call: the page answer carries its own rows (`console`).
      const { answer, data } = await readDbOnce(JSON.stringify(args), async () => {
        const page = await callMandateAdminList<MandateAdminPageAnswer>(args);
        if (page.rows.length === 0) return { answer: page, data: null };
        if (page.console) return { answer: page, data: consoleDataFromPage(page.console) };
        // A database older than the 2026-09-25 migration: read them, loudly.
        console.error(
          "[mandates] mnd_admin_list answered without the page's own rows — reading them separately. Apply migrations/mnd_admin_list_sources_contract_page_rows_2026_09_25.sql.",
        );
        const definitions = await fetchMandateConsoleData({
          mandateKeys: page.rows.map((row) => row.mandate_key),
          mandateIds: page.rows.map((row) => row.id),
        });
        return { answer: page, data: definitions };
      });
      // Built from the reports as they stand NOW — a report that landed while
      // the database half was read is in these rows.
      const current = getMandateAdminListState().reports;
      return {
        rows: data ? buildPageRows(answer.rows, data, current) : [],
        total: answer.total,
      };
    },
    fetchCounts: async (query) => {
      const reports = await reportsNow();
      const args = {
        p_mode: "counts",
        ...scopeArgs(query),
        p_facts: buildFacts(reports, sectionsFor(query)) as Json,
      };
      const answer = await readDbOnce(JSON.stringify(args), () =>
        callMandateAdminList<MandateAdminCountsAnswer>(args),
      );
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
