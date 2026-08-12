import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  analysisBooleanFilter,
  analysisNumberFilter,
  analysisSelectFilter,
  analysisTableRange,
  analysisTextFilter,
  cleanAnalysisSearch,
  isUuidFilter,
  priorityRowKey,
} from "@/features/marketing/data/analysis-query";
import type {
  AnalysisItemReference,
  AnalysisPagedResult,
  AnalysisPageReference,
  FindingDetailData,
  FindingListRow,
  MarketingAnalysisResult,
  MarketingFinding,
  PriorityQueueRow,
} from "@/features/marketing/data/analysis-types";
import { FINDING_STATUS_VALUES } from "@/features/marketing/data/finding-lifecycle";
import { assertFound } from "@/features/marketing/data/service";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import type { Json } from "@/types/database.types";

// One vocabulary, three readers: this filter validator, the badge/filter
// options, and the surface's `finding_lifecycle_status` write target.
const FINDING_STATUS = new Set<string>(FINDING_STATUS_VALUES);
const RESULT_STATUS = new Set(["pass", "warn", "fail", "error", "n_a"]);
const SEVERITY = new Set(["info", "low", "med", "high", "critical"]);
const SUBJECT_TYPE = new Set(["site", "page", "snapshot"]);

function assertData<T>(data: T | null, error: unknown): T {
  if (error) throw error;
  if (data === null) throw new Error("Supabase returned no data.");
  return data;
}

function allowedFilter(value: string | null, allowed: Set<string>) {
  return value && allowed.has(value) ? value : null;
}

async function loadPageReferences(
  siteId: string,
  pageIds: Array<string | null>,
  signal: AbortSignal,
): Promise<Map<string, AnalysisPageReference>> {
  const ids = Array.from(
    new Set(pageIds.filter((pageId): pageId is string => Boolean(pageId))),
  );
  if (ids.length === 0) return new Map();

  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("page")
    .select("id, path, url")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .in("id", ids)
    .abortSignal(signal);
  const rows = assertData(response.data, response.error);
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadAnalysisItem(
  itemId: string,
  signal: AbortSignal,
): Promise<AnalysisItemReference | null> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("analysis_item")
    .select(
      "id, key, label, description, category, subcategory, weight, score_contract, severity_map",
    )
    .eq("id", itemId)
    .is("deleted_at", null)
    .abortSignal(signal)
    .maybeSingle();
  if (response.error) throw response.error;
  return response.data;
}

async function loadReferencedResults(
  siteId: string,
  resultIds: Array<string | null>,
  signal: AbortSignal,
): Promise<Map<string, MarketingAnalysisResult>> {
  const ids = Array.from(
    new Set(
      resultIds.filter((resultId): resultId is string => Boolean(resultId)),
    ),
  );
  if (ids.length === 0) return new Map();

  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("analysis_result")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, subject_type, subject_id, page_id, item_id, item_key, category, subcategory, provider_id, provider_version, run_id, batch_id, computed_at, status, score, severity, issue_count, confidence, payload_instance_id",
    )
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .in("id", ids)
    .abortSignal(signal);
  const rows = assertData(response.data, response.error);
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * The analyzer's plain-language sentence for a result (`metadata.reasoning`),
 * written on EVERY result by aidream `web_crawl/analysis.py`. Returns null
 * rather than guessing — the UI has its own fallbacks.
 */
export function resultReasoning(metadata: Json): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, Json | undefined>).reasoning;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Catalogue labels for a set of item ids — `Map<item_id, label>`. A key the
 * catalogue does not carry yet is simply absent (never an error). */
async function loadAnalysisItemLabels(
  itemIds: Array<string | null>,
  signal: AbortSignal,
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(itemIds.filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0) return new Map();
  const response = await (await authenticatedWebDb(supabase))
    .from("analysis_item")
    .select("id, label")
    .in("id", ids)
    .is("deleted_at", null)
    .abortSignal(signal);
  const rows = assertData(response.data, response.error);
  return new Map(
    rows
      .filter((row): row is { id: string; label: string } =>
        Boolean(row.label),
      )
      .map((row) => [row.id, row.label]),
  );
}

export async function listSitePriorityQueue(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<AnalysisPagedResult<PriorityQueueRow>> {
  const abortSignal = signal ?? new AbortController().signal;
  const { from, to } = analysisTableRange(state);
  const sortColumns = {
    priority: "priority",
    item_key: "item_key",
    category: "category",
    subcategory: "subcategory",
    page_id: "page_id",
  } as const;
  const requestedSort = state.sort?.id ?? "priority";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "priority";
  const ascending = state.sort?.direction === "asc";

  let query = (await authenticatedWebDb(supabase))
    .from("v_priority_queue")
    .select(
      "site_id, page_id, item_id, item_key, category, subcategory, severity, priority",
      { count: "exact" },
    )
    .eq("site_id", siteId);

  const search = cleanAnalysisSearch(state.search);
  if (search) {
    query = query.or(
      `item_key.ilike.%${search}%,category.ilike.%${search}%,subcategory.ilike.%${search}%`,
    );
  }

  const itemKey = analysisTextFilter(state, "item_key");
  const category = analysisTextFilter(state, "category");
  const subcategory = analysisTextFilter(state, "subcategory");
  const severity = allowedFilter(
    analysisSelectFilter(state, "severity"),
    SEVERITY,
  );
  const priority = analysisNumberFilter(state, "priority");
  const pageId = analysisTextFilter(state, "page_id");

  if (itemKey) query = query.ilike("item_key", `%${itemKey}%`);
  if (category) query = query.ilike("category", `%${category}%`);
  if (subcategory) query = query.ilike("subcategory", `%${subcategory}%`);
  if (severity) query = query.eq("severity", severity);
  if (priority?.min !== undefined) query = query.gte("priority", priority.min);
  if (priority?.max !== undefined) query = query.lte("priority", priority.max);
  if (isUuidFilter(pageId)) query = query.eq("page_id", pageId);

  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("item_id", { ascending: true, nullsFirst: false });
  query = query.order("page_id", { ascending: true, nullsFirst: true });

  const response = await query.range(from, to).abortSignal(abortSignal);
  const rows = assertData(response.data, response.error);
  const pages = await loadPageReferences(
    siteId,
    rows.map((row) => row.page_id),
    abortSignal,
  );

  return {
    rows: rows.map((row, index) => {
      const page = row.page_id ? pages.get(row.page_id) : null;
      return {
        ...row,
        row_key: priorityRowKey(row, from + index),
        page_path: page?.path ?? null,
        page_url: page?.url ?? null,
      };
    }),
    total: response.count ?? 0,
  };
}

export async function listSiteFindings(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<AnalysisPagedResult<FindingListRow>> {
  const abortSignal = signal ?? new AbortController().signal;
  const { from, to } = analysisTableRange(state);
  const sortColumns = {
    item_key: "item_key",
    category: "category",
    subcategory: "subcategory",
    status: "status",
    subject_type: "subject_type",
    first_detected_at: "first_detected_at",
    last_detected_at: "last_detected_at",
    resolved_at: "resolved_at",
    updated_at: "updated_at",
  } as const;
  const requestedSort = state.sort?.id ?? "last_detected_at";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ??
    "last_detected_at";
  const ascending = state.sort?.direction === "asc";

  let query = (await authenticatedWebDb(supabase))
    .from("finding")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, subject_type, subject_id, page_id, item_id, item_key, category, subcategory, severity, status, suppressed, suppressed_reason, first_result_id, last_result_id, first_detected_at, last_detected_at, resolved_at",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .is("deleted_at", null);

  const search = cleanAnalysisSearch(state.search);
  if (search) {
    query = query.or(
      `item_key.ilike.%${search}%,category.ilike.%${search}%,subcategory.ilike.%${search}%,suppressed_reason.ilike.%${search}%`,
    );
  }

  const itemKey = analysisTextFilter(state, "item_key");
  const category = analysisTextFilter(state, "category");
  const subcategory = analysisTextFilter(state, "subcategory");
  const status = allowedFilter(
    analysisSelectFilter(state, "status"),
    FINDING_STATUS,
  );
  const severity = allowedFilter(
    analysisSelectFilter(state, "severity"),
    SEVERITY,
  );
  const subjectType = allowedFilter(
    analysisSelectFilter(state, "subject_type"),
    SUBJECT_TYPE,
  );
  const suppressed = analysisBooleanFilter(state, "suppressed");
  const itemId = analysisTextFilter(state, "item_id");
  const pageId = analysisTextFilter(state, "page_id");

  if (itemKey) query = query.ilike("item_key", `%${itemKey}%`);
  if (category) query = query.ilike("category", `%${category}%`);
  if (subcategory) query = query.ilike("subcategory", `%${subcategory}%`);
  if (status) query = query.eq("status", status);
  if (severity) query = query.eq("severity", severity);
  if (subjectType) query = query.eq("subject_type", subjectType);
  if (suppressed !== null) query = query.eq("suppressed", suppressed);
  if (isUuidFilter(itemId)) query = query.eq("item_id", itemId);
  if (isUuidFilter(pageId)) query = query.eq("page_id", pageId);

  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });

  const response = await query.range(from, to).abortSignal(abortSignal);
  const rows = assertData(response.data, response.error);

  return {
    rows: await enrichFindings(siteId, rows, abortSignal),
    total: response.count ?? 0,
  };
}

/**
 * Findings → readable rows. Three cheap direct reads keyed by ids already in
 * hand — the register must be readable WITHOUT opening each row (NO DEAD ENDS:
 * a row that only shows `canonical_conflicts / high` is not a UI). Every
 * finding's latest result carries the analyzer's own sentence; that is what
 * we render — and what the assist producer briefs the agent with.
 */
async function enrichFindings(
  siteId: string,
  rows: MarketingFinding[],
  signal: AbortSignal,
): Promise<FindingListRow[]> {
  if (rows.length === 0) return [];
  const [pages, labels, latestResults] = await Promise.all([
    loadPageReferences(
      siteId,
      rows.map((row) => row.page_id),
      signal,
    ),
    loadAnalysisItemLabels(
      rows.map((row) => row.item_id),
      signal,
    ),
    loadReferencedResults(
      siteId,
      rows.map((row) => row.last_result_id),
      signal,
    ),
  ]);
  return rows.map((row) => {
    const page = row.page_id ? pages.get(row.page_id) : null;
    const latest = row.last_result_id
      ? latestResults.get(row.last_result_id)
      : null;
    return {
      ...row,
      page_path: page?.path ?? null,
      page_url: page?.url ?? null,
      item_label: labels.get(row.item_id) ?? null,
      reasoning: latest ? resultReasoning(latest.metadata) : null,
    };
  });
}

export interface ActionableFindingsRead {
  rows: FindingListRow[];
  /** Live open+reopened, unsuppressed count for these keys (not the fetched
   * slice) — so a rollup chip can state the true number, never the sample. */
  total: number;
}

/**
 * The findings assist producer's ONE read: open (or reopened), unsuppressed
 * findings for the checks that have a real one-click AI action today.
 *
 * Deliberately narrow — the producer never sweeps the whole register. The key
 * allowlist comes from `aiRemedyItemKeys()` (derived from the remedy
 * registry), so a check with only a copy-able manual instruction can never
 * reach a chip whose button would have nothing to run.
 */
export async function listActionableOpenFindings(
  siteId: string,
  itemKeys: readonly string[],
  limit: number,
  signal?: AbortSignal,
): Promise<ActionableFindingsRead> {
  if (itemKeys.length === 0) return { rows: [], total: 0 };
  const abortSignal = signal ?? new AbortController().signal;
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("finding")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, subject_type, subject_id, page_id, item_id, item_key, category, subcategory, severity, status, suppressed, suppressed_reason, first_result_id, last_result_id, first_detected_at, last_detected_at, resolved_at",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .in("item_key", itemKeys as string[])
    .in("status", ["open", "reopened"])
    .eq("suppressed", false)
    .is("deleted_at", null)
    // Deterministic sample when capped: most recently detected first, then id.
    .order("last_detected_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(limit)
    .abortSignal(abortSignal);
  const rows = assertData(response.data, response.error);
  return {
    rows: await enrichFindings(siteId, rows, abortSignal),
    total: response.count ?? rows.length,
  };
}

/**
 * Open + reopened, unsuppressed findings for one canonical page — the EXACT
 * scope behind the workspace's "Open findings" count (`getPageWorkspace` in
 * `data/service.ts`), returned as full rows for inline display.
 */
export async function listPageOpenFindings(
  siteId: string,
  pageId: string,
  limit: number,
  signal?: AbortSignal,
): Promise<AnalysisPagedResult<MarketingFinding>> {
  const abortSignal = signal ?? new AbortController().signal;
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("finding")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, subject_type, subject_id, page_id, item_id, item_key, category, subcategory, severity, status, suppressed, suppressed_reason, first_result_id, last_result_id, first_detected_at, last_detected_at, resolved_at",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .eq("page_id", pageId)
    .in("status", ["open", "reopened"])
    .eq("suppressed", false)
    .is("deleted_at", null)
    .order("last_detected_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(limit)
    .abortSignal(abortSignal);
  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

/**
 * The checks that could NOT run on this page, and the one-click fix each one
 * is waiting on.
 *
 * `web.analysis_result` is insert-only, so a page accumulates one row per
 * check per analysis run. Only the MOST RECENT run states the current truth —
 * an older `n_a` whose evidence has since arrived would otherwise show the
 * user a button for a problem that no longer exists. So: read the page's
 * newest `computed_at`, then take only that run's `n_a` rows, and keep the
 * ones the server attached a remediation binding to (a genuinely
 * not-applicable check — "this page has no images" — carries none and is not
 * a blocked check).
 */
export async function listPageBlockedChecks(
  siteId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<MarketingAnalysisResult[]> {
  const abortSignal = signal ?? new AbortController().signal;
  const db = await authenticatedWebDb(supabase);

  const latest = await db
    .from("analysis_result")
    .select("computed_at")
    .eq("site_id", siteId)
    .eq("page_id", pageId)
    .is("deleted_at", null)
    .order("computed_at", { ascending: false })
    .limit(1)
    .abortSignal(abortSignal)
    .maybeSingle();
  if (latest.error) throw latest.error;
  if (!latest.data) return [];

  const response = await db
    .from("analysis_result")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, subject_type, subject_id, page_id, item_id, item_key, category, subcategory, provider_id, provider_version, run_id, batch_id, computed_at, status, score, severity, issue_count, confidence, payload_instance_id",
    )
    .eq("site_id", siteId)
    .eq("page_id", pageId)
    .eq("status", "n_a")
    .eq("computed_at", latest.data.computed_at)
    .is("deleted_at", null)
    .not("metadata->remediation", "is", null)
    .order("item_key", { ascending: true })
    .abortSignal(abortSignal);
  return assertData(response.data, response.error);
}

export async function getFindingDetail(
  siteId: string,
  findingId: string,
  signal?: AbortSignal,
): Promise<FindingDetailData> {
  const abortSignal = signal ?? new AbortController().signal;
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("finding")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, subject_type, subject_id, page_id, item_id, item_key, category, subcategory, severity, status, suppressed, suppressed_reason, first_result_id, last_result_id, first_detected_at, last_detected_at, resolved_at",
    )
    .eq("site_id", siteId)
    .eq("id", findingId)
    .is("deleted_at", null)
    .abortSignal(abortSignal)
    .maybeSingle();
  const finding: MarketingFinding = assertFound(
    response.data,
    response.error,
    "finding",
    findingId,
    "web_finding",
  );

  const [pages, item, results] = await Promise.all([
    loadPageReferences(siteId, [finding.page_id], abortSignal),
    loadAnalysisItem(finding.item_id, abortSignal),
    loadReferencedResults(
      siteId,
      [finding.first_result_id, finding.last_result_id],
      abortSignal,
    ),
  ]);

  return {
    finding,
    page: finding.page_id ? (pages.get(finding.page_id) ?? null) : null,
    item,
    firstResult: finding.first_result_id
      ? (results.get(finding.first_result_id) ?? null)
      : null,
    lastResult: finding.last_result_id
      ? (results.get(finding.last_result_id) ?? null)
      : null,
  };
}

export async function listFindingResults(
  finding: MarketingFinding,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<AnalysisPagedResult<MarketingAnalysisResult>> {
  const abortSignal = signal ?? new AbortController().signal;
  const { from, to } = analysisTableRange(state);
  const sortColumns = {
    computed_at: "computed_at",
    status: "status",
    score: "score",
    confidence: "confidence",
    issue_count: "issue_count",
    provider_version: "provider_version",
  } as const;
  const requestedSort = state.sort?.id ?? "computed_at";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "computed_at";
  const ascending = state.sort?.direction === "asc";

  let query = (await authenticatedWebDb(supabase))
    .from("analysis_result")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, subject_type, subject_id, page_id, item_id, item_key, category, subcategory, provider_id, provider_version, run_id, batch_id, computed_at, status, score, severity, issue_count, confidence, payload_instance_id",
      { count: "exact" },
    )
    .eq("site_id", finding.site_id)
    .eq("subject_type", finding.subject_type)
    .eq("subject_id", finding.subject_id)
    .eq("item_id", finding.item_id)
    .is("deleted_at", null);

  const search = cleanAnalysisSearch(state.search);
  if (search) {
    query = query.or(
      `provider_version.ilike.%${search}%,status.ilike.%${search}%,item_key.ilike.%${search}%`,
    );
  }

  const status = allowedFilter(
    analysisSelectFilter(state, "status"),
    RESULT_STATUS,
  );
  const severity = allowedFilter(
    analysisSelectFilter(state, "severity"),
    SEVERITY,
  );
  const providerVersion = analysisTextFilter(state, "provider_version");
  const score = analysisNumberFilter(state, "score");
  const confidence = analysisNumberFilter(state, "confidence");
  const issueCount = analysisNumberFilter(state, "issue_count");

  if (status) query = query.eq("status", status);
  if (severity) query = query.eq("severity", severity);
  if (providerVersion) {
    query = query.ilike("provider_version", `%${providerVersion}%`);
  }
  if (score?.min !== undefined) query = query.gte("score", score.min);
  if (score?.max !== undefined) query = query.lte("score", score.max);
  if (confidence?.min !== undefined) {
    query = query.gte("confidence", confidence.min);
  }
  if (confidence?.max !== undefined) {
    query = query.lte("confidence", confidence.max);
  }
  if (issueCount?.min !== undefined) {
    query = query.gte("issue_count", issueCount.min);
  }
  if (issueCount?.max !== undefined) {
    query = query.lte("issue_count", issueCount.max);
  }

  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });
  const result = await query.range(from, to).abortSignal(abortSignal);

  return {
    rows: assertData(result.data, result.error),
    total: result.count ?? 0,
  };
}

// ─── Catalogue-analysis overview (Audit tab) ────────────────────────────────
//
// The rollup the Audit workspace renders over the REAL analysis rows the
// per-page workers write (matrx-scraper `analyze_site_pages`, commissioned
// 2026-08-08): current site score (`web.v_site_score`), freshness, open
// findings grouped by catalogue item, and the score-ranked worst pages
// (`web.v_page_score`). Read-only; grouping happens client-side over a
// bounded fetch whose truncation is surfaced, never silent.

export const OPEN_FINDINGS_ROLLUP_CAP = 5000;
const WORST_PAGES_LIMIT = 8;

export interface AnalysisItemRollup {
  itemKey: string;
  category: string;
  subcategory: string;
  worstSeverity: string;
  count: number;
}

export interface AnalysisWorstPage {
  pageId: string;
  path: string | null;
  url: string | null;
  pageScore: number;
  failCount: number;
}

export interface SiteAnalysisOverview {
  siteScore: number | null;
  scoredPages: number;
  lastComputedAt: string | null;
  openFindingsTotal: number;
  /** True when the item rollup was computed over a capped sample. */
  rollupTruncated: boolean;
  openBySeverity: Record<string, number>;
  openByItem: AnalysisItemRollup[];
  worstPages: AnalysisWorstPage[];
}

const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  low: 1,
  med: 2,
  high: 3,
  critical: 4,
};

export async function getSiteAnalysisOverview(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteAnalysisOverview> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;

  const [scoreResponse, latestResponse, openResponse, worstResponse] =
    await Promise.all([
      db
        .from("v_site_score")
        .select("site_score, scored_pages")
        .eq("site_id", siteId)
        .abortSignal(abortSignal)
        .maybeSingle(),
      db
        .from("analysis_result")
        .select("computed_at")
        .eq("site_id", siteId)
        .is("deleted_at", null)
        .order("computed_at", { ascending: false })
        .limit(1)
        .abortSignal(abortSignal)
        .maybeSingle(),
      db
        .from("finding")
        .select("item_key, category, subcategory, severity", {
          count: "exact",
        })
        .eq("site_id", siteId)
        // "Open" here deliberately matches web.v_priority_queue (status !=
        // resolved AND not suppressed — acknowledged stays open), because the
        // panel's tiles link into the priority queue and the findings
        // register. listPageOpenFindings' narrower open+reopened set is a
        // per-page affordance, not this rollup's contract.
        .neq("status", "resolved")
        .eq("suppressed", false)
        .is("deleted_at", null)
        // Deterministic sample when capped: the most recently detected
        // findings, never an arbitrary heap-order slice.
        .order("last_detected_at", { ascending: false })
        .order("id", { ascending: true })
        .range(0, OPEN_FINDINGS_ROLLUP_CAP - 1)
        .abortSignal(abortSignal),
      db
        .from("v_page_score")
        .select("page_id, page_score, fail_count")
        .eq("site_id", siteId)
        .order("page_score", { ascending: true })
        .limit(WORST_PAGES_LIMIT)
        .abortSignal(abortSignal),
    ]);

  if (scoreResponse.error) throw scoreResponse.error;
  if (latestResponse.error) throw latestResponse.error;
  const openRows = assertData(openResponse.data, openResponse.error);
  const worstRows = assertData(worstResponse.data, worstResponse.error);

  const openBySeverity: Record<string, number> = {};
  const byItem = new Map<string, AnalysisItemRollup>();
  for (const row of openRows) {
    if (!row.item_key || !row.severity) continue;
    openBySeverity[row.severity] = (openBySeverity[row.severity] ?? 0) + 1;
    const existing = byItem.get(row.item_key);
    if (existing) {
      existing.count += 1;
      if (
        (SEVERITY_RANK[row.severity] ?? 0) >
        (SEVERITY_RANK[existing.worstSeverity] ?? 0)
      ) {
        existing.worstSeverity = row.severity;
      }
    } else {
      byItem.set(row.item_key, {
        itemKey: row.item_key,
        category: row.category ?? "",
        subcategory: row.subcategory ?? "",
        worstSeverity: row.severity,
        count: 1,
      });
    }
  }
  const openByItem = Array.from(byItem.values()).sort(
    (a, b) =>
      (SEVERITY_RANK[b.worstSeverity] ?? 0) -
        (SEVERITY_RANK[a.worstSeverity] ?? 0) || b.count - a.count,
  );

  const pageRefs = await loadPageReferences(
    siteId,
    worstRows.map((row) => row.page_id),
    abortSignal,
  );
  const worstPages: AnalysisWorstPage[] = worstRows.flatMap((row) => {
    if (row.page_id === null || row.page_score === null) return [];
    const ref = pageRefs.get(row.page_id);
    return [
      {
        pageId: row.page_id,
        path: ref?.path ?? null,
        url: ref?.url ?? null,
        pageScore: Number(row.page_score),
        failCount: Number(row.fail_count ?? 0),
      },
    ];
  });

  return {
    siteScore:
      scoreResponse.data?.site_score === null ||
      scoreResponse.data?.site_score === undefined
        ? null
        : Number(scoreResponse.data.site_score),
    scoredPages: Number(scoreResponse.data?.scored_pages ?? 0),
    lastComputedAt: latestResponse.data?.computed_at ?? null,
    openFindingsTotal: openResponse.count ?? openRows.length,
    rollupTruncated: (openResponse.count ?? 0) > openRows.length,
    openBySeverity,
    openByItem,
    worstPages,
  };
}
