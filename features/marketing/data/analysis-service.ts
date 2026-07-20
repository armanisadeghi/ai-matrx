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
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";

const FINDING_STATUS = new Set([
  "open",
  "acknowledged",
  "resolved",
  "reopened",
]);
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
  const pages = await loadPageReferences(
    siteId,
    rows.map((row) => row.page_id),
    abortSignal,
  );

  return {
    rows: rows.map((row) => {
      const page = row.page_id ? pages.get(row.page_id) : null;
      return {
        ...row,
        page_path: page?.path ?? null,
        page_url: page?.url ?? null,
      };
    }),
    total: response.count ?? 0,
  };
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
    .single();
  const finding: MarketingFinding = assertData(response.data, response.error);

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
