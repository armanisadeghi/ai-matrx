import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import type {
  BacklinkDimensionRow,
  BacklinkObservationRow,
  BacklinkPagedResult,
  BacklinkSnapshotRow,
  BacklinkTrendPoint,
  BacklinkWorkspaceData,
  ReferringDomainProfileRow,
} from "@/features/marketing/data/backlinks-types";
import type { BacklinkLensKey } from "@/features/marketing/components/backlinks/lib/vocab";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

const SUMMARY_DATASETS = [
  "summary",
  "backlinks",
  "referring_domains",
  "anchors",
  "history",
  "domain_pages",
  "domain_pages_summary",
  "timeseries_summary",
  "timeseries_new_lost_summary",
  "competitors",
] as const;

function assertData<T>(data: T | null, error: unknown): T {
  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (data === null) throw new Error("Backlink query returned no data.");
  return data;
}

function assertCount(count: number | null, error: unknown): number {
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return count ?? 0;
}

function rangeFor(state: MatrxDataTableQueryState) {
  const from = (state.page - 1) * state.pageSize;
  return { from, to: from + state.pageSize - 1 };
}

function cleanSearch(value: string): string {
  return value.trim().replace(/[(),"'\\]/g, " ");
}

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

async function latestSnapshot(
  siteId: string,
  dataset: string,
  signal?: AbortSignal,
): Promise<BacklinkSnapshotRow | null> {
  const response = await (
    await seoDb()
  )
    .from("backlink_snapshot")
    .select("*")
    .eq("site_id", siteId)
    .eq("dataset", dataset)
    .order("created_at", { ascending: false })
    .limit(1)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (response.error) throw response.error;
  return response.data;
}

async function latestDimensions(
  siteId: string,
  dataset: string,
  kind: BacklinkDimensionRow["dimension_kind"],
  signal?: AbortSignal,
): Promise<BacklinkDimensionRow[]> {
  const snapshot = await latestSnapshot(siteId, dataset, signal);
  if (!snapshot) return [];
  const response = await (
    await seoDb()
  )
    .from("backlink_dimension_snapshot")
    .select("*")
    .eq("site_id", siteId)
    .eq("snapshot_id", snapshot.id)
    .eq("dimension_kind", kind)
    .order("backlinks", { ascending: false, nullsFirst: false })
    .order("dimension_key", { ascending: true })
    .limit(50)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export async function getBacklinkWorkspace(
  siteId: string,
  signal?: AbortSignal,
): Promise<BacklinkWorkspaceData> {
  const db = await seoDb();
  const abortSignal = signal ?? new AbortController().signal;
  const response = await db
    .from("backlink_snapshot")
    .select("*")
    .eq("site_id", siteId)
    .in("dataset", [...SUMMARY_DATASETS])
    .order("created_at", { ascending: false })
    .limit(500)
    .abortSignal(abortSignal);
  const snapshots = assertData(response.data, response.error);
  const latestByDataset: Partial<Record<string, BacklinkSnapshotRow>> = {};
  for (const snapshot of snapshots) {
    latestByDataset[snapshot.dataset] ??= snapshot;
  }

  const [
    referringDomains,
    anchors,
    targetPages,
    competitors,
    profilesResponse,
    totalResponse,
    completedResponse,
    awaitingResponse,
    failedResponse,
    highPriorityResponse,
    controllableResponse,
  ] = await Promise.all([
    latestDimensions(siteId, "referring_domains", "referring_domain", signal),
    latestDimensions(siteId, "anchors", "anchor", signal),
    latestDimensions(siteId, "domain_pages_summary", "target_page", signal),
    latestDimensions(siteId, "competitors", "competitor_domain", signal),
    db
      .from("referring_domain_profile")
      .select("*")
      .eq("site_id", siteId)
      .order("opinion_score", { ascending: false, nullsFirst: false })
      .order("current_backlinks", { ascending: false })
      .limit(50)
      .abortSignal(signal ?? new AbortController().signal),
    db
      .from("backlink")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteId)
      .abortSignal(abortSignal),
    db
      .from("backlink")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("enrichment_status", "completed")
      .abortSignal(abortSignal),
    db
      .from("backlink")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteId)
      .in("enrichment_status", ["pending", "capturing", "analyzing"])
      .abortSignal(abortSignal),
    db
      .from("backlink")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteId)
      .in("enrichment_status", ["failed", "dead_letter"])
      .abortSignal(abortSignal),
    db
      .from("backlink")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("resolved_assessment->>priority", "high")
      .abortSignal(abortSignal),
    db
      .from("backlink")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteId)
      .in("resolved_assessment->controllability->>level", ["direct", "likely"])
      .abortSignal(abortSignal),
  ]);
  const domainProfiles = assertData(
    profilesResponse.data,
    profilesResponse.error,
  );
  const total = assertCount(totalResponse.count, totalResponse.error);
  const completed = assertCount(
    completedResponse.count,
    completedResponse.error,
  );
  const awaiting = assertCount(awaitingResponse.count, awaitingResponse.error);
  const failed = assertCount(failedResponse.count, failedResponse.error);
  const highPriority = assertCount(
    highPriorityResponse.count,
    highPriorityResponse.error,
  );
  const controllable = assertCount(
    controllableResponse.count,
    controllableResponse.error,
  );
  return {
    latestByDataset,
    referringDomains,
    anchors,
    targetPages,
    competitors,
    domainProfiles,
    enrichment: {
      total,
      completed,
      awaiting,
      failed,
      highPriority,
      controllable,
    },
  };
}

const TREND_ROW_CAP = 500;

/**
 * New/lost backlink trend (M-61): reads the DataForSEO timeseries snapshots
 * already stored per site — `timeseries_new_lost_summary` (new/lost per
 * period) merged with `timeseries_summary` (total/referring-domain running
 * counts for the same period). Both datasets land one row PER historical
 * period from a single provider call, so this is a pure read — no refresh
 * triggered here.
 */
export async function getBacklinkTrend(
  siteId: string,
  signal?: AbortSignal,
): Promise<BacklinkTrendPoint[]> {
  const db = await seoDb();
  const abortSignal = signal ?? new AbortController().signal;
  const [newLostResponse, totalsResponse] = await Promise.all([
    db
      .from("backlink_snapshot")
      .select("observed_at, new_backlinks, lost_backlinks")
      .eq("site_id", siteId)
      .eq("dataset", "timeseries_new_lost_summary")
      .order("observed_at", { ascending: true })
      .limit(TREND_ROW_CAP)
      .abortSignal(abortSignal),
    db
      .from("backlink_snapshot")
      .select("observed_at, total_backlinks, referring_domains")
      .eq("site_id", siteId)
      .eq("dataset", "timeseries_summary")
      .order("observed_at", { ascending: true })
      .limit(TREND_ROW_CAP)
      .abortSignal(abortSignal),
  ]);
  const newLostRows = assertData(newLostResponse.data, newLostResponse.error);
  const totalsRows = assertData(totalsResponse.data, totalsResponse.error);
  const totalsByDate = new Map(totalsRows.map((row) => [row.observed_at, row]));

  return newLostRows.map((row) => {
    const totals = totalsByDate.get(row.observed_at);
    const newBacklinks = row.new_backlinks;
    const lostBacklinks = row.lost_backlinks;
    return {
      observed_at: row.observed_at,
      new_backlinks: newBacklinks,
      lost_backlinks: lostBacklinks,
      net_backlinks:
        newBacklinks === null && lostBacklinks === null
          ? null
          : (newBacklinks ?? 0) - (lostBacklinks ?? 0),
      total_backlinks: totals?.total_backlinks ?? null,
      referring_domains: totals?.referring_domains ?? null,
    };
  });
}

const BACKLINK_SORT_COLUMNS: Readonly<
  Record<string, keyof BacklinkObservationRow>
> = {
  source_url: "source_url",
  source_domain: "source_domain",
  target_url: "target_url",
  anchor_text: "anchor_text",
  state: "state",
  is_dofollow: "is_dofollow",
  link_type: "link_type",
  enrichment_status: "enrichment_status",
  our_score: "assessment_score",
  relevance: "assessment_relevance_score",
  page_type: "assessment_page_type",
  control: "assessment_control_level",
  action: "assessment_action",
  first_seen_at: "first_seen_at",
  last_seen_at: "last_seen_at",
  lost_at: "lost_at",
  source_rank: "source_rank",
  domain_rank: "domain_rank",
  spam_score: "spam_score",
  created_at: "created_at",
};

export function resolveBacklinkSortColumn(
  columnId: string | undefined,
): keyof BacklinkObservationRow | null {
  return columnId ? (BACKLINK_SORT_COLUMNS[columnId] ?? null) : null;
}

function selectedValues(
  filter: MatrxDataTableQueryState["columnFilters"][string],
): string[] {
  if (!filter || filter.kind !== "select") return [];
  return (filter.values?.length ? filter.values : [filter.value]).filter(
    Boolean,
  );
}

/**
 * Default sort when the user has not chosen one, per lens. Exported so the
 * table UI can seed its URL sort state with what the server actually does.
 */
export const LENS_DEFAULT_SORT: Record<
  BacklinkLensKey,
  { column: string; ascending: boolean }
> = {
  best: { column: "domain_rank", ascending: false },
  new: { column: "first_seen_at", ascending: false },
  lost: { column: "last_seen_at", ascending: false },
  broken: { column: "domain_rank", ascending: false },
  toxic: { column: "spam_score", ascending: false },
  actionable: { column: "domain_rank", ascending: false },
  relevant: { column: "domain_rank", ascending: false },
  controllable: { column: "domain_rank", ascending: false },
};

export async function listLatestBacklinks(
  siteId: string,
  state: MatrxDataTableQueryState,
  options?: { lens?: BacklinkLensKey },
  signal?: AbortSignal,
): Promise<BacklinkPagedResult<BacklinkObservationRow>> {
  const { from, to } = rangeFor(state);
  const db = await seoDb();
  let query = db
    .from("backlink")
    .select("*", { count: "exact" })
    .eq("site_id", siteId);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `source_url.ilike.%${search}%,source_domain.ilike.%${search}%,target_url.ilike.%${search}%,anchor_text.ilike.%${search}%`,
    );
  }
  const lens = options?.lens;
  if (lens === "best") {
    query = query.eq("is_dofollow", true).neq("state", "lost");
  } else if (lens === "new") {
    query = query.eq("state", "new");
  } else if (lens === "lost") {
    query = query.eq("state", "lost");
  } else if (lens === "broken") {
    // Same definition the table's broken glyph uses: provider flag OR a
    // failing target status. `->` (jsonb) compares 400 numerically; `->>`
    // would compare text lexicographically.
    query = query.or(
      "provider_evidence->extras->>is_broken.eq.true,provider_evidence->extras->url_to_status_code.gte.400",
    );
  } else if (lens === "toxic") {
    query = query.or(
      "resolved_assessment->risk->>verdict.eq.high_risk,resolved_assessment->risk->>verdict.eq.review",
    );
  } else if (lens === "actionable") {
    query = query.eq("resolved_assessment->>priority", "high");
  } else if (lens === "relevant") {
    query = query.eq(
      "resolved_assessment->source_target_relevance->>verdict",
      "strong",
    );
  } else if (lens === "controllable") {
    query = query.in("resolved_assessment->controllability->>level", [
      "direct",
      "likely",
    ]);
  }
  const states = selectedValues(state.columnFilters.state);
  if (states.length === 1) {
    query = query.eq("state", states[0]);
  } else if (states.length > 1) {
    query = query.in("state", states);
  }
  const dofollow = state.columnFilters.is_dofollow;
  if (dofollow?.kind === "boolean") {
    query = query.eq("is_dofollow", dofollow.value);
  }
  const linkTypes = selectedValues(state.columnFilters.link_type);
  if (linkTypes.length === 1) {
    query = query.eq("link_type", linkTypes[0]);
  } else if (linkTypes.length > 1) {
    query = query.in("link_type", linkTypes);
  }
  const placements = selectedValues(state.columnFilters.placement);
  if (placements.length === 1) {
    query = query.eq(
      "provider_evidence->extras->>semantic_location",
      placements[0],
    );
  } else if (placements.length > 1) {
    query = query.in(
      "provider_evidence->extras->>semantic_location",
      placements,
    );
  }
  const analysisStatuses = selectedValues(
    state.columnFilters.enrichment_status,
  );
  if (analysisStatuses.length === 1) {
    query = query.eq("enrichment_status", analysisStatuses[0]);
  } else if (analysisStatuses.length > 1) {
    query = query.in("enrichment_status", analysisStatuses);
  }
  const scoreFilter = state.columnFilters.our_score;
  if (scoreFilter?.kind === "number") {
    if (scoreFilter.min !== undefined) {
      query = query.gte("assessment_score", scoreFilter.min);
    }
    if (scoreFilter.max !== undefined) {
      query = query.lte("assessment_score", scoreFilter.max);
    }
  }
  const relevanceVerdicts = selectedValues(state.columnFilters.relevance);
  if (relevanceVerdicts.length === 1) {
    query = query.eq("assessment_relevance_verdict", relevanceVerdicts[0]);
  } else if (relevanceVerdicts.length > 1) {
    query = query.in("assessment_relevance_verdict", relevanceVerdicts);
  }
  const pageTypes = selectedValues(state.columnFilters.page_type);
  if (pageTypes.length === 1) {
    query = query.eq("assessment_page_type", pageTypes[0]);
  } else if (pageTypes.length > 1) {
    query = query.in("assessment_page_type", pageTypes);
  }
  const controlLevels = selectedValues(state.columnFilters.control);
  if (controlLevels.length === 1) {
    query = query.eq("assessment_control_level", controlLevels[0]);
  } else if (controlLevels.length > 1) {
    query = query.in("assessment_control_level", controlLevels);
  }
  const actions = selectedValues(state.columnFilters.action);
  if (actions.length === 1) {
    query = query.eq("assessment_action", actions[0]);
  } else if (actions.length > 1) {
    query = query.in("assessment_action", actions);
  }
  const fallbackSort = lens ? LENS_DEFAULT_SORT[lens] : null;
  const sortColumn =
    resolveBacklinkSortColumn(state.sort?.id) ??
    resolveBacklinkSortColumn(fallbackSort?.column) ??
    "domain_rank";
  const ascending = state.sort
    ? state.sort.direction === "asc"
    : (fallbackSort?.ascending ?? false);
  const response = await query
    .order(sortColumn, { ascending, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

/** Exact durable row for a drawer/window that must outlive table re-sorting. */
export async function getBacklink(
  backlinkId: string,
  signal?: AbortSignal,
): Promise<BacklinkObservationRow> {
  const response = await (
    await seoDb()
  )
    .from("backlink")
    .select("*")
    .eq("id", backlinkId)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) throw new Error("This backlink no longer exists.");
  return response.data;
}

const DOMAIN_PROFILE_SORT_COLUMNS = new Set([
  "display_domain",
  "current_backlinks",
  "current_referring_pages",
  "opinion_score",
  "opinion_verdict",
  "last_seen_at",
]);

export async function listReferringDomainProfiles(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<BacklinkPagedResult<ReferringDomainProfileRow>> {
  const { from, to } = rangeFor(state);
  const db = await seoDb();
  let query = db
    .from("referring_domain_profile")
    .select("*", { count: "exact" })
    .eq("site_id", siteId);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `display_domain.ilike.%${search}%,opinion_summary.ilike.%${search}%,domain_type.ilike.%${search}%`,
    );
  }
  const verdict = state.columnFilters.opinion_verdict;
  if (verdict?.kind === "select" && verdict.value) {
    query = query.eq("opinion_verdict", verdict.value);
  }
  const sortColumn =
    state.sort && DOMAIN_PROFILE_SORT_COLUMNS.has(state.sort.id)
      ? state.sort.id
      : "opinion_score";
  const ascending = state.sort ? state.sort.direction === "asc" : false;
  const response = await query
    .order(sortColumn, { ascending, nullsFirst: false })
    .order("display_domain", { ascending: true })
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

/** Which snapshot dataset owns each dimension kind. */
const DIMENSION_DATASET_BY_KIND = {
  referring_domain: "referring_domains",
  anchor: "anchors",
  target_page: "domain_pages_summary",
  competitor_domain: "competitors",
} as const;

export type BacklinkDimensionKind = keyof typeof DIMENSION_DATASET_BY_KIND;

const DIMENSION_SORT_COLUMNS = new Set([
  "label",
  "dimension_key",
  "backlinks",
  "referring_domains",
  "rank_score",
  "spam_score",
  "first_seen_at",
  "last_seen_at",
]);

/**
 * Controlled paged read over the LATEST dimension snapshot of one kind —
 * powers the full Referring domains / Anchors / Top pages / Competitors tabs
 * (the old UI truncated these to a top-8 card; this never truncates).
 */
export async function listDimensionRows(
  siteId: string,
  kind: BacklinkDimensionKind,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<BacklinkPagedResult<BacklinkDimensionRow>> {
  const snapshot = await latestSnapshot(
    siteId,
    DIMENSION_DATASET_BY_KIND[kind],
    signal,
  );
  if (!snapshot) return { rows: [], total: 0 };
  const { from, to } = rangeFor(state);
  const db = await seoDb();
  let query = db
    .from("backlink_dimension_snapshot")
    .select("*", { count: "exact" })
    .eq("site_id", siteId)
    .eq("snapshot_id", snapshot.id)
    .eq("dimension_kind", kind);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `label.ilike.%${search}%,dimension_key.ilike.%${search}%,url.ilike.%${search}%`,
    );
  }
  const sortColumn =
    state.sort && DIMENSION_SORT_COLUMNS.has(state.sort.id)
      ? state.sort.id
      : "backlinks";
  const ascending = state.sort ? state.sort.direction === "asc" : false;
  const response = await query
    .order(sortColumn, { ascending, nullsFirst: false })
    .order("dimension_key", { ascending: true })
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

/**
 * The full latest anchor set (bounded by the provider's 1000-row detail cap)
 * for anchor-profile classification. One read, classified client-side —
 * a few hundred rows per site.
 */
export async function listAllAnchors(
  siteId: string,
  signal?: AbortSignal,
): Promise<BacklinkDimensionRow[]> {
  const snapshot = await latestSnapshot(siteId, "anchors", signal);
  if (!snapshot) return [];
  const response = await (
    await seoDb()
  )
    .from("backlink_dimension_snapshot")
    .select("*")
    .eq("site_id", siteId)
    .eq("snapshot_id", snapshot.id)
    .eq("dimension_kind", "anchor")
    .order("backlinks", { ascending: false, nullsFirst: false })
    .limit(1000)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}
