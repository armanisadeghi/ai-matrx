import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import type {
  BacklinkDimensionRow,
  BacklinkObservationRow,
  BacklinkPagedResult,
  BacklinkSnapshotRow,
  BacklinkTrendPoint,
  BacklinkWorkspaceData,
} from "@/features/marketing/data/backlinks-types";
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
  const response = await db
    .from("backlink_snapshot")
    .select("*")
    .eq("site_id", siteId)
    .in("dataset", [...SUMMARY_DATASETS])
    .order("created_at", { ascending: false })
    .limit(500)
    .abortSignal(signal ?? new AbortController().signal);
  const snapshots = assertData(response.data, response.error);
  const latestByDataset: Partial<Record<string, BacklinkSnapshotRow>> = {};
  for (const snapshot of snapshots) {
    latestByDataset[snapshot.dataset] ??= snapshot;
  }

  const [referringDomains, anchors, targetPages, competitors] =
    await Promise.all([
      latestDimensions(siteId, "referring_domains", "referring_domain", signal),
      latestDimensions(siteId, "anchors", "anchor", signal),
      latestDimensions(siteId, "domain_pages_summary", "target_page", signal),
      latestDimensions(siteId, "competitors", "competitor_domain", signal),
    ]);
  return {
    latestByDataset,
    referringDomains,
    anchors,
    targetPages,
    competitors,
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
  const totalsByDate = new Map(
    totalsRows.map((row) => [row.observed_at, row]),
  );

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

const BACKLINK_SORT_COLUMNS = new Set([
  "source_url",
  "source_domain",
  "target_url",
  "anchor_text",
  "state",
  "is_dofollow",
  "first_seen_at",
  "last_seen_at",
  "source_rank",
  "domain_rank",
  "spam_score",
  "created_at",
]);

export async function listLatestBacklinks(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<BacklinkPagedResult<BacklinkObservationRow>> {
  const snapshot = await latestSnapshot(siteId, "backlinks", signal);
  if (!snapshot) return { rows: [], total: 0 };
  const { from, to } = rangeFor(state);
  const db = await seoDb();
  let query = db
    .from("backlink_observation")
    .select("*", { count: "exact" })
    .eq("site_id", siteId)
    .eq("snapshot_id", snapshot.id);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `source_url.ilike.%${search}%,source_domain.ilike.%${search}%,target_url.ilike.%${search}%,anchor_text.ilike.%${search}%`,
    );
  }
  const stateFilter = state.columnFilters.state;
  if (stateFilter?.kind === "select" && stateFilter.value) {
    query = query.eq("state", stateFilter.value);
  }
  const dofollow = state.columnFilters.is_dofollow;
  if (dofollow?.kind === "boolean") {
    query = query.eq("is_dofollow", dofollow.value);
  }
  const sortColumn =
    state.sort && BACKLINK_SORT_COLUMNS.has(state.sort.id)
      ? state.sort.id
      : "domain_rank";
  const ascending = state.sort?.direction === "asc";
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
