import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  buildStoredSeoMetrics,
  parseStoredSeoMetrics,
} from "@/features/marketing/seo/serp/metrics";
import { parseStoredAuditMetrics } from "@/features/marketing/seo/audit/stored";
import {
  parseSiteAuditRollup,
  parseSiteAuditTrend,
  type AuditTrendPoint,
  type SiteAuditRollup,
} from "@/features/marketing/lib/audit-rollup";
import type {
  BrandAsset,
  BrandListRow,
  BrandProperty,
  BusinessFact,
  ConfirmAssetInput,
  ConfirmFactInput,
  ConfirmPropertyInput,
  CrawlEvent,
  CrawlSession,
  CrawlUrl,
  CreateBrandInput,
  CreateSiteInput,
  DiscoveredItem,
  DiscoveredItemStatus,
  CreateBrandAssetInput,
  CreateBusinessFactInput,
  CreateManualPageInput,
  CreatePropertyInput,
  HomepageObservedMeta,
  MarketingBrand,
  MarketingPage,
  MarketingSite,
  MetaApplyTarget,
  PageListRow,
  PageSnapshot,
  PageUpdate,
  PageWorkspaceData,
  PagedResult,
  PageSitemapMembershipRow,
  SitemapCoverage,
  SitemapPageRow,
  SiteSitemap,
  SiteGscDailyPoint,
  SiteGscTopPage,
  SiteListRow,
  SiteOverviewMetrics,
  SiteScreenshot,
  UpdateBrandAssetInput,
  UpdateBrandInput,
  UpdateBusinessFactInput,
  PageContent,
  PageDesiredValues,
  SavePageContentInput,
  UpdatePageDesiredValuesInput,
  UpdatePageIntentInput,
  UpdatePropertyInput,
  UpdateSiteIdentityInput,
} from "@/features/marketing/types";
import { isJsonRecord, isPropertyKind } from "@/features/marketing/types";
import { extractErrorMessage, operationFailed } from "@/utils/errors";
import type { Database, Json } from "@/types/database.types";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import { applyPageOnlyFilters } from "@/features/marketing/lib/page-content-class";
import {
  parseSnapshotImages,
  parseSnapshotResources,
} from "@/features/marketing/lib/snapshot-content";
import type { SiteMediaPageRow } from "@/features/marketing/lib/snapshot-media";
import type { SiteVideoResourceRow } from "@/features/marketing/lib/snapshot-video";
import type { StructurePageRow } from "@/features/marketing/lib/route-tree";
import {
  normalisePageUrl,
  pagePathOf,
  pageUrlHash,
} from "@/features/marketing/lib/page-url";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import {
  guardedUpdate,
  type GuardedUpdateArgs,
  type VersionedRow,
} from "@/utils/supabase/guardedUpdate";

function rangeFor(state: MatrxDataTableQueryState) {
  const from = (state.page - 1) * state.pageSize;
  return { from, to: from + state.pageSize - 1 };
}

function cleanSearch(value: string): string {
  return value.trim().replace(/[(),"'\\]/g, " ");
}

function numberFilter(
  state: MatrxDataTableQueryState,
  column: string,
): { min?: number; max?: number } | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "number" ? filter : null;
}

function selectFilter(
  state: MatrxDataTableQueryState,
  column: string,
): string | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "select" && filter.value ? filter.value : null;
}

function selectFilterValues(
  state: MatrxDataTableQueryState,
  column: string,
): string[] {
  const filter = state.columnFilters[column];
  if (filter?.kind !== "select") return [];
  const values = filter.values?.filter(Boolean);
  if (values?.length) return values;
  return filter.value ? [filter.value] : [];
}

function textFilter(
  state: MatrxDataTableQueryState,
  column: string,
): string | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "text" && filter.value.trim()
    ? cleanSearch(filter.value)
    : null;
}

function booleanFilter(
  state: MatrxDataTableQueryState,
  column: string,
): boolean | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "boolean" ? filter.value : null;
}

function visibilityFilter(
  state: MatrxDataTableQueryState,
): MarketingSite["visibility"] | null {
  const value = selectFilter(state, "visibility");
  return value === "personal" ||
    value === "internal" ||
    value === "link" ||
    value === "public"
    ? value
    : null;
}

export function assertData<T>(data: T | null, error: unknown): T {
  if (error) throw error;
  if (data === null) throw new Error("Supabase returned no data.");
  return data;
}

/**
 * Resolve a single-entity read whose row can be soft-deleted out from under an
 * open view (delete in another tab/session racing a refetch). Callers MUST use
 * `.maybeSingle()` — never `.single()`, whose 0-row PGRST116 leaks a red
 * "Cannot coerce the result…" error into the inspector instead of this
 * human-readable one.
 *
 * It does NOT claim deletion: a zero-row read is equally an access gap or a
 * stale id (D133 — two reviews rejected as "site deleted" over a live site the
 * reader's orgs didn't reach). Where the caller can cheaply re-ask without the
 * `deleted_at` filter, use `assertFoundOrProbeDeleted` and get the truth.
 */
export function assertFound<T>(
  data: T | null,
  error: unknown,
  entity: string,
  recordId?: string,
  /** Canonical entity token — pass it and the surface ASKS instead of guessing. */
  token?: string,
): T {
  if (error) throw error;
  if (data === null) {
    throw recordUnavailable({ entity, recordId, reason: "unknown", token });
  }
  return data;
}

/**
 * `assertFound` for reads the caller can re-ask WITHOUT the `deleted_at`
 * filter — the same RLS-filtered read, so no new access path is invented. A
 * row that comes back carrying `deleted_at` PROVES deletion; anything else
 * stays honestly ambiguous, because deleted / not-permitted / bad-id are
 * indistinguishable from the client without a privileged existence probe.
 */
export async function assertFoundOrProbeDeleted<T>(
  data: T | null,
  error: unknown,
  entity: string,
  recordId: string,
  probeDeleted: () => PromiseLike<{
    data: { deleted_at: string | null } | null;
    error: unknown;
  }>,
  /** Canonical entity token — pass it and the surface ASKS instead of guessing. */
  token?: string,
): Promise<T> {
  if (error) throw error;
  if (data !== null) return data;
  const probe = await probeDeleted();
  throw recordUnavailable({
    entity,
    recordId,
    token,
    reason: !probe.error && probe.data?.deleted_at ? "deleted" : "unknown",
  });
}

/**
 * Loud-mutation guard: an UPDATE whose RLS filter matched 0 rows returns
 * SUCCESS from PostgREST — for a universally-viewable row that a non-editor
 * tries to delete, that silent no-op would toast "deleted" while nothing
 * happened. Every write mutation whose target can be visible-but-not-editable
 * runs through this: `.select("id")` the update and assert a row came back.
 */
export function assertMutated(
  rows: Array<{ id: string }> | null,
  error: unknown,
  what: string,
): void {
  if (error) throw error;
  if (!rows || rows.length === 0) {
    // Zero matched rows is the write-side twin of the zero-row read: it is
    // equally "no editor access", "already removed", and "stale id". Leading
    // with a permission verdict asserted one of the three — say what we know
    // (the write did not happen) and name the possibilities as possibilities.
    throw operationFailed(
      `${what} — nothing was changed. It may need editor access you don't have, or the record may already be gone`,
    );
  }
}

/** Every `web.site` column — ONE list so selects can never drift per call site. */
export const SITE_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, name, root_url, domain, status, visibility, integrations, homepage_screenshot_id, settings, brand_id, description, favicon_url, logo_url, og_image_url, initialized_at, initialization, gsc_synced_at, gsc_sync";

/**
 * VIEW LAW: listSites / listSiteOptions are DELIBERATE org-browse surfaces,
 * not bare-RLS-relies-on-it lists. The marketing admin table shows every
 * `web.site` row the caller's org membership grants — a cross-org
 * "everything I administer" view is the intended product behavior here
 * (site management, not a personal content list). RLS remains the ceiling;
 * this constant documents the intent so it reads as a decision, not an
 * accidental leak.
 */
export const MARKETING_SITES_IS_DELIBERATE_ORG_BROWSE = true as const;

/** Every KPI column exposed by `web.v_site_kpis` — ONE select string. */
const SITE_KPI_COLUMNS =
  "site_id, page_count, resource_count, pages_in_gsc, gsc_clicks_28d, gsc_impressions_28d, gsc_position_28d, gsc_clicks_prev_28d, gsc_impressions_prev_28d, gsc_cur_days, gsc_prev_days, gsc_latest_date";

/** Portfolio sort columns served by `web.v_site_kpis` (not `web.site`). */
const SITE_KPI_SORT_COLUMNS = new Set([
  "page_count",
  "pages_in_gsc",
  "gsc_clicks_28d",
  "gsc_impressions_28d",
  "gsc_position_28d",
]);

type SiteKpiRow = Database["web"]["Views"]["v_site_kpis"]["Row"];

function mergeSiteListRow(
  site: MarketingSite,
  score: { site_score: number | null; scored_pages: number | null } | undefined,
  kpis: SiteKpiRow | undefined,
): SiteListRow {
  return {
    ...site,
    health_score: score?.site_score ?? null,
    scored_pages: Number(score?.scored_pages ?? 0),
    page_count: Number(kpis?.page_count ?? 0),
    // Crawled non-HTML URLs, excluded from page_count. Carried so the list can
    // SAY what it left out — a silently smaller number is its own defect.
    resource_count: Number(kpis?.resource_count ?? 0),
    pages_in_gsc: Number(kpis?.pages_in_gsc ?? 0),
    gsc_clicks_28d: kpis?.gsc_clicks_28d ?? null,
    gsc_impressions_28d: kpis?.gsc_impressions_28d ?? null,
    gsc_position_28d: kpis?.gsc_position_28d ?? null,
    gsc_clicks_prev_28d: kpis?.gsc_clicks_prev_28d ?? null,
    gsc_impressions_prev_28d: kpis?.gsc_impressions_prev_28d ?? null,
    gsc_prev_days: Number(kpis?.gsc_prev_days ?? 0),
    gsc_latest_date: kpis?.gsc_latest_date ?? null,
  };
}

export async function listSites(
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<PagedResult<SiteListRow>> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const { from, to } = rangeFor(state);
  const sortColumns = {
    name: "name",
    domain: "domain",
    status: "status",
    visibility: "visibility",
    updated_at: "updated_at",
    created_at: "created_at",
  } as const;
  const requestedSort = state.sort?.id ?? "gsc_clicks_28d";
  const kpiSort = SITE_KPI_SORT_COLUMNS.has(requestedSort)
    ? requestedSort
    : null;
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "updated_at";
  const ascending = state.sort?.direction === "asc";

  let query = db
    .from("site")
    .select(SITE_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,domain.ilike.%${search}%,root_url.ilike.%${search}%`,
    );
  }
  const name = textFilter(state, "name");
  const domain = textFilter(state, "domain");
  const status = selectFilter(state, "status");
  const visibility = visibilityFilter(state);
  if (name) query = query.ilike("name", `%${name}%`);
  if (domain) query = query.ilike("domain", `%${domain}%`);
  if (status) query = query.eq("status", status);
  if (visibility) query = query.eq("visibility", visibility);

  if (kpiSort) {
    // KPI sorts live on web.v_site_kpis, so the ORDER BY has to happen there:
    // pull every matching site id (portfolio scale — hundreds, not millions),
    // rank + page on the view, then hydrate the page of site rows.
    const idResponse = await query
      .order("id", { ascending: true })
      .range(0, 1999)
      .abortSignal(abortSignal);
    const matching = assertData(idResponse.data, idResponse.error);
    const total = idResponse.count ?? matching.length;
    if (matching.length === 0) return { rows: [], total };
    const siteById = new Map(matching.map((site) => [site.id, site]));

    const kpiResponse = await db
      .from("v_site_kpis")
      .select(SITE_KPI_COLUMNS)
      .in(
        "site_id",
        matching.map((site) => site.id),
      )
      .order(kpiSort, { ascending, nullsFirst: false })
      .order("site_id", { ascending })
      .range(from, to)
      .abortSignal(abortSignal);
    const kpiRows = assertData(kpiResponse.data, kpiResponse.error);
    const pageIds = kpiRows.flatMap((row) =>
      row.site_id ? [row.site_id] : [],
    );
    if (pageIds.length === 0) return { rows: [], total };

    const scoreResponse = await db
      .from("v_site_score")
      .select("site_id, site_score, scored_pages")
      .in("site_id", pageIds)
      .abortSignal(abortSignal);
    const scores = assertData(scoreResponse.data, scoreResponse.error);
    const scoreBySite = new Map(scores.map((score) => [score.site_id, score]));

    return {
      rows: kpiRows.flatMap((kpis) => {
        const site = kpis.site_id ? siteById.get(kpis.site_id) : undefined;
        if (!site) return [];
        return [mergeSiteListRow(site, scoreBySite.get(site.id), kpis)];
      }),
      total,
    };
  }

  if (requestedSort === "health_score") {
    // The health score lives on web.v_site_score, which only has rows for
    // scored sites — an ORDER BY on the view would silently DROP unscored
    // sites from the page. Rank scored sites via the view, append unscored
    // ones (by id), page over the concatenation, then hydrate. Same bounded
    // id-prefilter as the KPI sorts (portfolio scale — hundreds).
    const idResponse = await query
      .order("id", { ascending: true })
      .range(0, 1999)
      .abortSignal(abortSignal);
    const matching = assertData(idResponse.data, idResponse.error);
    const total = idResponse.count ?? matching.length;
    if (matching.length === 0) return { rows: [], total };

    const scoreResponse = await db
      .from("v_site_score")
      .select("site_id, site_score, scored_pages")
      .in(
        "site_id",
        matching.map((site) => site.id),
      )
      .abortSignal(abortSignal);
    const scores = assertData(scoreResponse.data, scoreResponse.error);
    const scoreBySite = new Map(scores.map((score) => [score.site_id, score]));
    const scored = matching.filter((site) => scoreBySite.has(site.id));
    const unscored = matching.filter((site) => !scoreBySite.has(site.id));
    scored.sort((a, b) => {
      const diff =
        Number(scoreBySite.get(a.id)?.site_score ?? 0) -
        Number(scoreBySite.get(b.id)?.site_score ?? 0);
      return (ascending ? diff : -diff) || a.id.localeCompare(b.id);
    });
    const ordered = [...scored, ...unscored].slice(from, to + 1);
    if (ordered.length === 0) return { rows: [], total };

    const kpiResponse = await db
      .from("v_site_kpis")
      .select(SITE_KPI_COLUMNS)
      .in(
        "site_id",
        ordered.map((site) => site.id),
      )
      .abortSignal(abortSignal);
    const kpiRows = assertData(kpiResponse.data, kpiResponse.error);
    const kpisBySite = new Map(kpiRows.map((row) => [row.site_id, row]));
    return {
      rows: ordered.map((site) =>
        mergeSiteListRow(site, scoreBySite.get(site.id), kpisBySite.get(site.id)),
      ),
      total,
    };
  }

  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });
  const response = await query.range(from, to).abortSignal(abortSignal);
  const sites = assertData(response.data, response.error);

  if (sites.length === 0) return { rows: [], total: response.count ?? 0 };
  const siteIds = sites.map((site) => site.id);
  const [scoreResponse, kpiResponse] = await Promise.all([
    db
      .from("v_site_score")
      .select("site_id, site_score, scored_pages")
      .in("site_id", siteIds)
      .abortSignal(abortSignal),
    db
      .from("v_site_kpis")
      .select(SITE_KPI_COLUMNS)
      .in("site_id", siteIds)
      .abortSignal(abortSignal),
  ]);
  const scores = assertData(scoreResponse.data, scoreResponse.error);
  const kpiRows = assertData(kpiResponse.data, kpiResponse.error);
  const bySite = new Map(scores.map((score) => [score.site_id, score]));
  const kpisBySite = new Map(kpiRows.map((row) => [row.site_id, row]));

  return {
    rows: sites.map((site) =>
      mergeSiteListRow(site, bySite.get(site.id), kpisBySite.get(site.id)),
    ),
    total: response.count ?? 0,
  };
}

/** Site-level daily GSC rollup for the KPI peek chart. */
export async function getSiteGscDaily(
  siteId: string,
  days: number,
  signal?: AbortSignal,
): Promise<SiteGscDailyPoint[]> {
  const db = await authenticatedWebDb(supabase);
  const response = await db
    .rpc("site_gsc_daily", { p_site_id: siteId, p_days: days })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

/** Top canonical pages by clicks over a window, for the KPI peek. */
export async function getSiteGscTopPages(
  siteId: string,
  days: number,
  limit: number,
  signal?: AbortSignal,
): Promise<SiteGscTopPage[]> {
  const db = await authenticatedWebDb(supabase);
  const response = await db
    .rpc("site_gsc_top_pages", {
      p_site_id: siteId,
      p_days: days,
      p_limit: limit,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export async function listSiteOptions(
  signal?: AbortSignal,
): Promise<MarketingSite[]> {
  const rows: MarketingSite[] = [];
  const abortSignal = signal ?? new AbortController().signal;
  const db = await authenticatedWebDb(supabase);
  for (let page = 0; page < 5; page += 1) {
    const from = page * 1000;
    const response = await db
      .from("site")
      .select(SITE_COLUMNS)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999)
      .abortSignal(abortSignal);
    const batch = assertData(response.data, response.error);
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

export async function countSites(signal?: AbortSignal): Promise<number> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("site")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw new Error(response.error.message);
  return response.count ?? 0;
}

export async function getSite(
  siteId: string,
  signal?: AbortSignal,
): Promise<MarketingSite> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const response = await db
    .from("site")
    .select(SITE_COLUMNS)
    .eq("id", siteId)
    .is("deleted_at", null)
    .abortSignal(abortSignal)
    .maybeSingle();
  return assertFoundOrProbeDeleted(
    response.data,
    response.error,
    "site",
    siteId,
    () =>
      db
        .from("site")
        .select("deleted_at")
        .eq("id", siteId)
        .abortSignal(abortSignal)
        .maybeSingle(),
    "web_site",
  );
}

export async function getSiteOverview(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteOverviewMetrics> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const [
    score,
    pages,
    unconfirmedCandidates,
    resourceUrls,
    findings,
    snapshots,
    latestCrawl,
    targetKeywordPages,
    pagesInGsc,
    blockedPages,
    serpIssues,
    sitemaps,
    crawlSessions,
  ] = await Promise.all([
    db
      .from("v_site_score")
      .select("site_id, site_score, scored_pages")
      .eq("site_id", siteId)
      .abortSignal(abortSignal)
      .maybeSingle(),
    // The headline is evidence-backed. The durable registry also retains
    // aliases, resources, and never-confirmed crawl candidates; those remain
    // inspectable without being presented as pages.
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .eq("has_page_evidence", true)
      .abortSignal(abortSignal),
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .eq("has_page_evidence", false)
      .abortSignal(abortSignal),
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", true)
      .abortSignal(abortSignal),
    db
      .from("finding")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .in("status", ["open", "reopened"])
      .eq("suppressed", false)
      .is("deleted_at", null)
      .abortSignal(abortSignal),
    db
      .from("snapshot")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .abortSignal(abortSignal),
    db
      .from("crawl_session")
      .select(
        "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, status, trigger, scope, stats, started_at, finished_at, error",
      )
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .order("started_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1)
      .abortSignal(abortSignal)
      .maybeSingle(),
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .eq("has_page_evidence", true)
      .not("target_keyword", "is", null)
      .abortSignal(abortSignal),
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .eq("in_gsc", true)
      .abortSignal(abortSignal),
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .eq("indexability_verdict", "blocked")
      .abortSignal(abortSignal),
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .eq("serp_ok", false)
      .abortSignal(abortSignal),
    db
      .from("sitemap")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .abortSignal(abortSignal),
    db
      .from("crawl_session")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .abortSignal(abortSignal),
  ]);

  if (score.error) throw score.error;
  if (pages.error) throw pages.error;
  if (unconfirmedCandidates.error) throw unconfirmedCandidates.error;
  if (resourceUrls.error) throw resourceUrls.error;
  if (findings.error) throw findings.error;
  if (snapshots.error) throw snapshots.error;
  if (latestCrawl.error) throw latestCrawl.error;
  if (targetKeywordPages.error) throw targetKeywordPages.error;
  if (pagesInGsc.error) throw pagesInGsc.error;
  if (blockedPages.error) throw blockedPages.error;
  if (serpIssues.error) throw serpIssues.error;
  if (sitemaps.error) throw sitemaps.error;
  if (crawlSessions.error) throw crawlSessions.error;

  return {
    siteScore: score.data?.site_score ?? null,
    scoredPages: Number(score.data?.scored_pages ?? 0),
    canonicalPages: pages.count ?? 0,
    unconfirmedCandidates: unconfirmedCandidates.count ?? 0,
    resourceUrls: resourceUrls.count ?? 0,
    openFindings: findings.count ?? 0,
    snapshots: snapshots.count ?? 0,
    latestCrawl: latestCrawl.data,
    targetKeywordPages: targetKeywordPages.count ?? 0,
    pagesInGsc: pagesInGsc.count ?? 0,
    blockedPages: blockedPages.count ?? 0,
    serpIssues: serpIssues.count ?? 0,
    sitemaps: sitemaps.count ?? 0,
    crawlSessions: crawlSessions.count ?? 0,
  };
}

/** Read observed homepage `<title>` and meta description from the latest snapshot. */
export async function getHomepageObservedMeta(
  siteId: string,
  rootUrl: string,
  signal?: AbortSignal,
): Promise<HomepageObservedMeta | null> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const pageResponse = await db
    .from("page")
    .select("id, latest_snapshot_id")
    .eq("site_id", siteId)
    .eq("url", rootUrl)
    .is("deleted_at", null)
    .abortSignal(abortSignal)
    .maybeSingle();
  if (pageResponse.error) throw pageResponse.error;

  const page = pageResponse.data;
  if (!page?.latest_snapshot_id) return null;

  const snapshotResponse = await db
    .from("snapshot")
    .select("head_tags, captured_at")
    .eq("site_id", siteId)
    .eq("id", page.latest_snapshot_id)
    .abortSignal(abortSignal)
    .maybeSingle();
  if (snapshotResponse.error) throw snapshotResponse.error;
  if (!snapshotResponse.data) return null;

  const parsed = parseSnapshotHeadTags(snapshotResponse.data.head_tags);
  return {
    pageId: page.id,
    metaTitle: parsed.title,
    metaDescription: parsed.metaDescription,
    capturedAt: snapshotResponse.data.captured_at,
  };
}

export async function createSite(
  input: CreateSiteInput,
): Promise<MarketingSite> {
  const response = await (
    await authenticatedWebDb(supabase)
  ).rpc("create_site", {
    p_organization_id: input.organizationId,
    p_name: input.name,
    p_root_url: input.rootUrl,
    p_domain: input.domain,
    p_settings: {},
    p_integrations: {},
    // p_visibility deliberately omitted: web.create_site inherits
    // platform.entity_types.default_visibility ('internal' for web_site) —
    // hardcoding a visibility in a creation path is a defect (2026-08-08).
    // An explicit brand ALWAYS wins; name-match-or-create only when absent.
    ...(input.brandId ? { p_brand_id: input.brandId } : {}),
  });
  return assertData(response.data, response.error);
}

/**
 * Reassign a site (and its website property row) to another same-org brand
 * via `web.move_site_brand` — the repair path for mis-attached sites.
 */
export async function moveSiteBrand(
  siteId: string,
  brandId: string,
): Promise<MarketingSite> {
  const response = await (
    await authenticatedWebDb(supabase)
  ).rpc("move_site_brand", { p_site_id: siteId, p_brand_id: brandId });
  return assertData(response.data, response.error);
}

/** Light brand options (id/name) for one organization, name-ordered. */
export async function listBrandOptions(
  organizationId: string,
  signal?: AbortSignal,
): Promise<Array<Pick<MarketingBrand, "id" | "name">>> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("brand")
    .select("id, name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .limit(1000)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

/** Every `web.page` column — ONE list so selects can never drift per call site. */
export const PAGE_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, canonical_page_id, url, url_hash, path, provenance, status, first_seen, last_seen, http_status_last, content_type_last, target_keyword, meta_title_desired, meta_description_desired, seo_metrics_desired, desired_values, latest_snapshot_id, launch_tracking, link_score, link_score_computed_at";

/** Every `web.snapshot` column — ONE list so selects can never drift per call site. */
export const SNAPSHOT_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, page_id, session_id, captured_at, final_url, http_status, content_hash, word_count, body_file_id, markdown_file_id, head_tags, headings, links_summary, images, structured_data, perf, extracted, seo_metrics, audit_metrics";

/**
 * Source-disagreement coverage filters over the canonical page registry.
 * Membership = a live `web.page_sitemap` row; crawled = `latest_snapshot_id`.
 */
export type PageCoverageFilter =
  | "all_known"
  | "unconfirmed"
  | "in_sitemap"
  | "crawled"
  | "never_crawled"
  | "sitemap_not_crawled"
  | "crawled_no_sitemap"
  | "in_gsc"
  | "gsc_no_sitemap"
  | "sitemap_no_gsc"
  | "gone";

export const PAGE_COVERAGE_FILTERS: readonly PageCoverageFilter[] = [
  "all_known",
  "unconfirmed",
  "in_sitemap",
  "crawled",
  "never_crawled",
  "sitemap_not_crawled",
  "crawled_no_sitemap",
  "in_gsc",
  "gsc_no_sitemap",
  "sitemap_no_gsc",
  "gone",
];

export function isPageCoverageFilter(
  value: string | null,
): value is PageCoverageFilter {
  return (
    value !== null &&
    (PAGE_COVERAGE_FILTERS as readonly string[]).includes(value)
  );
}

/**
 * Which half of the anchor registry a Pages read wants.
 *
 * Crawls record every fetched URL, so `web.page` legitimately holds images,
 * json, xml and pdfs alongside HTML pages (597 of 10,608 live rows). They are
 * real evidence — a sitemap listing non-HTML URLs is an SEO finding — but they
 * are not what "pages" means to a user, and counting them inflates every total.
 *
 * So resources are a deliberate DESTINATION, exactly like `?scope=dismissed`:
 * `pages` is the default, `resources` is the opt-in view, `all` is the raw
 * registry. Classification is the server's (`v_page_list.is_resource`).
 */
export type PageResourceScope = "pages" | "resources" | "all";

export function isPageResourceScope(
  value: string | null,
): value is PageResourceScope {
  return value === "pages" || value === "resources" || value === "all";
}

export async function listPages(
  siteId: string,
  state: MatrxDataTableQueryState,
  coverage: PageCoverageFilter | null = null,
  resourceScope: PageResourceScope = "pages",
  signal?: AbortSignal,
): Promise<PagedResult<PageListRow>> {
  const db = await authenticatedWebDb(supabase);
  const { from, to } = rangeFor(state);
  const sortColumns = {
    sitemap_count: "sitemap_count",
    word_count: "word_count",
    health_score: "health_score",
    gsc_clicks_28d: "gsc_clicks_28d",
    gsc_impressions_28d: "gsc_impressions_28d",
    gsc_position_28d: "gsc_position_28d",
    url: "url",
    path: "path",
    status: "status",
    provenance: "provenance",
    http_status_last: "http_status_last",
    target_keyword: "target_keyword",
    first_seen: "first_seen",
    last_seen: "last_seen",
  } as const;
  const requestedSort = state.sort?.id ?? "gsc_clicks_28d";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "gsc_clicks_28d";
  const ascending = state.sort?.direction === "asc";

  // The one-row-per-page projection makes enriched snapshot, sitemap, and GSC
  // values queryable BEFORE the bounded range. Canonical page rows are still
  // hydrated from web.page by id; the view is a query projection, not a second
  // page authority.
  let query = db
    .from("v_page_list")
    .select(
      "page_id, sitemap_count, in_gsc, observed_title, word_count, serp_ok, social_ok, indexability_verdict, health_score, gsc_clicks_28d, gsc_impressions_28d, gsc_position_28d",
      { count: "exact" },
    )
    .eq("site_id", siteId);

  if (resourceScope === "pages") {
    query = query.eq("is_canonical", true).eq("is_resource", false);
    if (coverage !== "all_known" && coverage !== "unconfirmed") {
      query = query.eq("has_page_evidence", true);
    }
  } else if (resourceScope === "resources") {
    query = query.eq("is_canonical", true).eq("is_resource", true);
  }

  if (coverage === "unconfirmed") {
    query = query.eq("has_page_evidence", false);
  } else if (coverage === "in_sitemap") {
    query = query.gt("sitemap_count", 0);
  } else if (coverage === "crawled") {
    query = query.not("latest_snapshot_id", "is", null);
  } else if (coverage === "never_crawled") {
    query = query.is("latest_snapshot_id", null);
  } else if (coverage === "sitemap_not_crawled") {
    query = query.gt("sitemap_count", 0).is("latest_snapshot_id", null);
  } else if (coverage === "crawled_no_sitemap") {
    query = query.eq("sitemap_count", 0).not("latest_snapshot_id", "is", null);
  } else if (coverage === "in_gsc") {
    query = query.eq("in_gsc", true);
  } else if (coverage === "gsc_no_sitemap") {
    query = query.eq("in_gsc", true).eq("sitemap_count", 0);
  } else if (coverage === "sitemap_no_gsc") {
    query = query.gt("sitemap_count", 0).eq("in_gsc", false);
  } else if (coverage === "gone") {
    // `status = 'missing'` is the crawler saying it no longer finds the URL.
    // This is the destination the site audit's gone-page count links to, so
    // every page it excludes from the HTML-quality findings stays reachable.
    query = query.eq("status", "missing");
  }

  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `url.ilike.%${search}%,path.ilike.%${search}%,target_keyword.ilike.%${search}%,observed_title.ilike.%${search}%`,
    );
  }
  const url = textFilter(state, "url");
  const path = textFilter(state, "path");
  const keyword = textFilter(state, "target_keyword");
  const statuses = selectFilterValues(state, "status");
  const provenances = selectFilterValues(state, "provenance");
  const sitemapCount = numberFilter(state, "sitemap_count");
  const wordCount = numberFilter(state, "word_count");
  const http = numberFilter(state, "http_status_last");
  const healthScore = numberFilter(state, "health_score");
  const clicks = numberFilter(state, "gsc_clicks_28d");
  const impressions = numberFilter(state, "gsc_impressions_28d");
  const position = numberFilter(state, "gsc_position_28d");
  if (url) query = query.ilike("url", `%${url}%`);
  if (path) query = query.ilike("path", `%${path}%`);
  if (keyword) query = query.ilike("target_keyword", `%${keyword}%`);
  if (statuses.length === 1) query = query.eq("status", statuses[0]);
  if (statuses.length > 1) query = query.in("status", statuses);
  if (provenances.length === 1) query = query.eq("provenance", provenances[0]);
  if (provenances.length > 1) query = query.in("provenance", provenances);
  if (sitemapCount?.min !== undefined)
    query = query.gte("sitemap_count", sitemapCount.min);
  if (sitemapCount?.max !== undefined)
    query = query.lte("sitemap_count", sitemapCount.max);
  if (wordCount?.min !== undefined)
    query = query.gte("word_count", wordCount.min);
  if (wordCount?.max !== undefined)
    query = query.lte("word_count", wordCount.max);
  if (http?.min !== undefined) query = query.gte("http_status_last", http.min);
  if (http?.max !== undefined) query = query.lte("http_status_last", http.max);
  if (healthScore?.min !== undefined)
    query = query.gte("health_score", healthScore.min);
  if (healthScore?.max !== undefined)
    query = query.lte("health_score", healthScore.max);
  if (clicks?.min !== undefined)
    query = query.gte("gsc_clicks_28d", clicks.min);
  if (clicks?.max !== undefined)
    query = query.lte("gsc_clicks_28d", clicks.max);
  if (impressions?.min !== undefined)
    query = query.gte("gsc_impressions_28d", impressions.min);
  if (impressions?.max !== undefined)
    query = query.lte("gsc_impressions_28d", impressions.max);
  if (position?.min !== undefined)
    query = query.gte("gsc_position_28d", position.min);
  if (position?.max !== undefined)
    query = query.lte("gsc_position_28d", position.max);

  query = query.order(sortColumn, { ascending, nullsFirst: false });
  if (sortColumn === "gsc_clicks_28d") {
    query = query.order("gsc_impressions_28d", {
      ascending,
      nullsFirst: false,
    });
  }
  query = query.order("page_id", { ascending: true });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  const projections = assertData(response.data, response.error);
  if (projections.length === 0) return { rows: [], total: response.count ?? 0 };
  const projectionRows = projections.flatMap((projection) =>
    projection.page_id ? [{ ...projection, page_id: projection.page_id }] : [],
  );
  if (projectionRows.length !== projections.length) {
    throw new Error("Page-list projection returned a row without a page id.");
  }
  const pageIds = projectionRows.map((projection) => projection.page_id);
  const pageResponse = await db
    .from("page")
    .select(PAGE_COLUMNS)
    .eq("site_id", siteId)
    .in("id", pageIds)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  const pageRows = assertData(pageResponse.data, pageResponse.error);
  const pageById = new Map(pageRows.map((page) => [page.id, page]));

  return {
    rows: projectionRows.map((projection) => {
      const page = pageById.get(projection.page_id);
      if (!page) {
        throw new Error(
          `Page-list projection referenced missing page ${projection.page_id}.`,
        );
      }
      const verdict = projection.indexability_verdict;
      if (
        verdict !== null &&
        verdict !== "indexable" &&
        verdict !== "check" &&
        verdict !== "blocked"
      ) {
        throw new Error(
          `Page-list projection returned invalid indexability verdict “${verdict}”.`,
        );
      }
      return {
        ...page,
        sitemap_count: Number(projection.sitemap_count ?? 0),
        in_gsc: projection.in_gsc ?? false,
        observed_title: projection.observed_title,
        word_count: projection.word_count,
        serp_ok: projection.serp_ok,
        social_ok: projection.social_ok,
        indexability_verdict: verdict,
        health_score: projection.health_score,
        gsc_clicks_28d: projection.gsc_clicks_28d,
        gsc_impressions_28d: projection.gsc_impressions_28d,
        gsc_position_28d: projection.gsc_position_28d,
      };
    }),
    total: response.count ?? 0,
  };
}

/** Live sitemap memberships for one canonical page, with each sitemap's URL. */
export async function listPageSitemapMemberships(
  siteId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<PageSitemapMembershipRow[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("page_sitemap")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, page_id, sitemap_id, lastmod, changefreq, priority, first_seen, last_seen, sitemap:sitemap_id!inner(id, url, kind)",
    )
    .eq("site_id", siteId)
    .eq("page_id", pageId)
    .is("deleted_at", null)
    .order("last_seen", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(100)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

/** All stored screenshots for one canonical page, newest first, bounded. */
export async function listPageScreenshots(
  siteId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<SiteScreenshot[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("screenshot")
    .select(SCREENSHOT_COLUMNS)
    .eq("site_id", siteId)
    .eq("page_id", pageId)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(60)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

/** Per-provenance canonical-page counts (registry stamp of who found the URL). */
export type PageProvenance = "gsc" | "sitemap" | "crawl" | "manual";

export const PAGE_PROVENANCES: readonly PageProvenance[] = [
  "gsc",
  "sitemap",
  "crawl",
  "manual",
];

export interface SiteCoverageMatrix {
  /** Canonical non-resource URLs with retained crawl/source/manual evidence. */
  totalPages: number;
  /** Confirmed + unconfirmed canonical non-resource registry URLs. */
  knownPageUrls: number;
  /** Crawl candidates with no retained page evidence yet. */
  unconfirmedCandidates: number;
  /** Canonical URLs positively classified as non-HTML resources. */
  resourceUrls: number;
  inSitemaps: number;
  crawled: number;
  neverCrawled: number;
  sitemapNotCrawled: number;
  crawledNoSitemap: number;
  /** Pages with any GSC stat rows (Google reports them in search results). */
  inGsc: number;
  /** Pages Google reports that no sitemap advertises. */
  gscNoSitemap: number;
  /** Advertised pages Google never reports — invisible to search. */
  sitemapNoGsc: number;
  byProvenance: Record<PageProvenance, number>;
}

/**
 * The source-disagreement matrix over the canonical page registry: how the
 * evidence sources (sitemap membership, crawl snapshots, provenance) agree or
 * disagree about every canonical page.
 */
export async function getCoverageMatrix(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteCoverageMatrix> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;

  const confirmedPages = () =>
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .eq("has_page_evidence", true);
  const membershipPages = () =>
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .eq("has_page_evidence", true)
      .gt("sitemap_count", 0);
  const antiMembershipPages = () =>
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .eq("has_page_evidence", true)
      .eq("sitemap_count", 0);

  const gscPages = () =>
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .eq("has_page_evidence", true)
      .eq("in_gsc", true);

  const [
    total,
    knownPageUrls,
    unconfirmedCandidates,
    resourceUrls,
    inSitemaps,
    crawled,
    neverCrawled,
    sitemapNotCrawled,
    crawledNoSitemap,
    inGsc,
    gscNoSitemap,
    sitemapNoGsc,
    ...provenanceCounts
  ] = await Promise.all([
    confirmedPages().abortSignal(abortSignal),
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .abortSignal(abortSignal),
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", false)
      .eq("has_page_evidence", false)
      .abortSignal(abortSignal),
    db
      .from("v_page_list")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("is_canonical", true)
      .eq("is_resource", true)
      .abortSignal(abortSignal),
    membershipPages().abortSignal(abortSignal),
    confirmedPages().not("latest_snapshot_id", "is", null).abortSignal(abortSignal),
    confirmedPages().is("latest_snapshot_id", null).abortSignal(abortSignal),
    membershipPages().is("latest_snapshot_id", null).abortSignal(abortSignal),
    antiMembershipPages()
      .not("latest_snapshot_id", "is", null)
      .abortSignal(abortSignal),
    gscPages().abortSignal(abortSignal),
    gscPages()
      .eq("sitemap_count", 0)
      .abortSignal(abortSignal),
    membershipPages()
      .eq("in_gsc", false)
      .abortSignal(abortSignal),
    ...PAGE_PROVENANCES.map((provenance) =>
      confirmedPages().eq("provenance", provenance).abortSignal(abortSignal),
    ),
  ]);

  for (const response of [
    total,
    knownPageUrls,
    unconfirmedCandidates,
    resourceUrls,
    inSitemaps,
    crawled,
    neverCrawled,
    sitemapNotCrawled,
    crawledNoSitemap,
    inGsc,
    gscNoSitemap,
    sitemapNoGsc,
    ...provenanceCounts,
  ]) {
    if (response.error) throw response.error;
  }

  const byProvenance = {} as Record<PageProvenance, number>;
  PAGE_PROVENANCES.forEach((provenance, index) => {
    byProvenance[provenance] = provenanceCounts[index]?.count ?? 0;
  });

  return {
    totalPages: total.count ?? 0,
    knownPageUrls: knownPageUrls.count ?? 0,
    unconfirmedCandidates: unconfirmedCandidates.count ?? 0,
    resourceUrls: resourceUrls.count ?? 0,
    inSitemaps: inSitemaps.count ?? 0,
    crawled: crawled.count ?? 0,
    neverCrawled: neverCrawled.count ?? 0,
    sitemapNotCrawled: sitemapNotCrawled.count ?? 0,
    crawledNoSitemap: crawledNoSitemap.count ?? 0,
    inGsc: inGsc.count ?? 0,
    gscNoSitemap: gscNoSitemap.count ?? 0,
    sitemapNoGsc: sitemapNoGsc.count ?? 0,
    byProvenance,
  };
}

export async function getPageWorkspace(
  siteId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<PageWorkspaceData> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const pageResponse = await db
    .from("page")
    .select(PAGE_COLUMNS)
    .eq("site_id", siteId)
    .eq("id", pageId)
    .is("deleted_at", null)
    .abortSignal(abortSignal)
    .maybeSingle();
  const page = await assertFoundOrProbeDeleted(
    pageResponse.data,
    pageResponse.error,
    "page",
    pageId,
    () =>
      db
        .from("page")
        .select("deleted_at")
        .eq("site_id", siteId)
        .eq("id", pageId)
        .abortSignal(abortSignal)
        .maybeSingle(),
    "web_page",
  );

  const [
    snapshotResponse,
    scoreResponse,
    findingsResponse,
    searchPerformanceResponse,
  ] = await Promise.all([
    page.latest_snapshot_id
      ? db
          .from("snapshot")
          .select(SNAPSHOT_COLUMNS)
          .eq("site_id", siteId)
          .eq("page_id", pageId)
          .eq("id", page.latest_snapshot_id)
          .abortSignal(abortSignal)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("v_page_score")
      .select("site_id, page_id, page_score, fail_count")
      .eq("site_id", siteId)
      .eq("page_id", pageId)
      .abortSignal(abortSignal)
      .maybeSingle(),
    db
      .from("finding")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("page_id", pageId)
      .in("status", ["open", "reopened"])
      .eq("suppressed", false)
      .is("deleted_at", null)
      .abortSignal(abortSignal),
    db
      .from("v_page_list")
      .select("in_gsc, gsc_clicks_28d, gsc_impressions_28d, gsc_position_28d")
      .eq("site_id", siteId)
      .eq("page_id", pageId)
      .abortSignal(abortSignal)
      .maybeSingle(),
  ]);
  if (snapshotResponse.error) throw snapshotResponse.error;
  if (scoreResponse.error) throw scoreResponse.error;
  if (findingsResponse.error) throw findingsResponse.error;
  if (searchPerformanceResponse.error) throw searchPerformanceResponse.error;

  return {
    page,
    latestSnapshot: snapshotResponse.data,
    score: scoreResponse.data?.page_score ?? null,
    failCount: Number(scoreResponse.data?.fail_count ?? 0),
    openFindings: findingsResponse.count ?? 0,
    searchPerformance: searchPerformanceResponse.data ?? {
      in_gsc: false,
      gsc_clicks_28d: null,
      gsc_impressions_28d: null,
      gsc_position_28d: null,
    },
  };
}

/**
 * Pages a generated title/description can be applied to, searched by URL.
 *
 * Deliberately NOT `listPages`: that is site-scoped, table-shaped and paginated
 * for the pages workspace. Applying metadata starts from a title with no site
 * context (an agent generated it in chat), so this searches across every site
 * RLS lets the caller see and returns only what the write needs — including
 * `version`, because `updatePageIntent` is optimistically locked on it.
 */
export async function searchPagesForMetaApply(
  term: string,
  limit = 12,
  signal?: AbortSignal,
): Promise<MetaApplyTarget[]> {
  const db = await authenticatedWebDb(supabase);
  let query = db
    .from("page")
    .select(
      "id, site_id, url, version, target_keyword, meta_title_desired, meta_description_desired, site!inner(id)",
    )
    .is("deleted_at", null)
    // A page whose SITE was soft-deleted is not part of any workspace, but the
    // site delete does NOT cascade to its pages (deliberately — page soft-delete
    // hard-deletes the row's association edges). Every site-scoped reader is
    // safe by construction; this one searches across sites, so it must say so.
    // 817 orphan rows existed when this was added, and they were the entire
    // cause of the "same URL appears twice" report — there are zero same-site
    // duplicates, `page_site_id_url_hash_key` has always guaranteed that.
    .is("site.deleted_at", null)
    .eq("status", "active");
  // Crawls record assets and machine endpoints as page rows too — offering
  // someone a .png or a /wp-json/ endpoint to "apply a meta title to" is noise.
  // Both halves of the one rule: the crawler's content_type verdict, plus URL
  // shape for the rows it has never fetched (content_type_last is NULL for most
  // of the registry, so the verdict alone lets every oEmbed URL through).
  query = applyPageOnlyFilters(query);

  const trimmed = term.trim();
  if (trimmed) {
    // A URL search box receives percent-encoding (%20, %2F) and underscores
    // routinely, and both are LIKE metacharacters — unescaped, "%2F" matches
    // nearly every row. Escape before interpolating.
    const escaped = trimmed.replace(/[\\%_]/g, (char) => `\\${char}`);
    query = query.ilike("url", `%${escaped}%`);
  }

  query = query
    .order("last_seen", { ascending: false, nullsFirst: false })
    .limit(limit);
  const response = await (signal ? query.abortSignal(signal) : query);
  if (response.error) throw response.error;
  return response.data ?? [];
}

/**
 * Marketing's posture on the shared optimistic-concurrency helper: every
 * guarded write here historically threw ONE feature-specific message on a
 * lost CAS, whether the row changed or vanished (a soft-deleted row is
 * "gone" per the contract, and both read as "changed in another session" to
 * the user). This wrapper keeps that exact outcome on top of guardedUpdate.
 */
async function guardedUpdateOrThrow<Row extends VersionedRow>(
  args: GuardedUpdateArgs<Row> & { conflictMessage: string },
): Promise<Row> {
  const { conflictMessage, ...guardArgs } = args;
  const result = await guardedUpdate(guardArgs);
  if (result.status !== "saved") throw new Error(conflictMessage);
  return result.row;
}

export async function updatePageIntent(
  input: UpdatePageIntentInput,
): Promise<MarketingPage> {
  // Desired-metadata metrics are recomputed on EVERY intent save (contract in
  // migrations/web_seo_metrics.sql) — the deterministic evaluator matches the
  // scraper's crawl-time computation exactly, so stored numbers never depend
  // on who wrote them.
  const hasDesired = Boolean(
    input.desiredMetaTitle || input.desiredMetaDescription,
  );
  const patch: PageUpdate = {
    target_keyword: input.targetKeyword,
    meta_title_desired: input.desiredMetaTitle,
    meta_description_desired: input.desiredMetaDescription,
    seo_metrics_desired: hasDesired
      ? buildStoredSeoMetrics(
          input.desiredMetaTitle ?? "",
          input.desiredMetaDescription ?? "",
          "client",
        )
      : null,
  };
  const db = await authenticatedWebDb(supabase);
  return guardedUpdateOrThrow<MarketingPage>({
    expectedVersion: input.expectedVersion,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("page")
        .update({ ...patch, version: nextVersion })
        .eq("site_id", input.siteId)
        .eq("id", input.pageId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(PAGE_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("page")
        .select(PAGE_COLUMNS)
        .eq("site_id", input.siteId)
        .eq("id", input.pageId)
        .is("deleted_at", null)
        .maybeSingle(),
    conflictMessage: "This page changed in another session. Reload and try again.",
  });
}

/**
 * The ONE write path for `web.page.desired_values`. Read-merge-write: fetch
 * the fresh row (values + version), shallow-merge ONLY the caller's keys over
 * it, and update guarded by that fresh version. Two cards saving different
 * areas can never clobber each other; a true concurrent edit of the same page
 * still trips the version guard (one silent retry, then a loud error).
 */
export async function updatePageDesiredValues(
  input: UpdatePageDesiredValuesInput,
  attempt = 0,
): Promise<MarketingPage> {
  const db = await authenticatedWebDb(supabase);
  const freshResponse = await db
    .from("page")
    .select("desired_values, version")
    .eq("site_id", input.siteId)
    .eq("id", input.pageId)
    .is("deleted_at", null)
    .maybeSingle();
  const fresh = assertFound(
    freshResponse.data,
    freshResponse.error,
    "page",
    input.pageId,
    "web_page",
  );
  const current: PageDesiredValues = isJsonRecord(fresh.desired_values)
    ? (fresh.desired_values as PageDesiredValues)
    : {};
  const merged = { ...current, ...input.patch };
  const result = await guardedUpdate<MarketingPage>({
    expectedVersion: fresh.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("page")
        .update({
          desired_values: merged as PageUpdate["desired_values"],
          version: nextVersion,
        })
        .eq("site_id", input.siteId)
        .eq("id", input.pageId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(PAGE_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("page")
        .select(PAGE_COLUMNS)
        .eq("site_id", input.siteId)
        .eq("id", input.pageId)
        .is("deleted_at", null)
        .maybeSingle(),
  });
  if (result.status === "saved") return result.row;
  // One silent retry on a true version race — the retry re-reads and re-merges.
  if (result.status === "conflict" && attempt === 0) {
    return updatePageDesiredValues(input, 1);
  }
  throw new Error(
    "This page changed in another session. Reload and try again.",
  );
}

/** Authored draft content row for a page (1:1); null until first save. */
export async function getPageContent(
  siteId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<PageContent | null> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("page_content")
    .select("*")
    .eq("site_id", siteId)
    .eq("page_id", pageId)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (response.error) throw response.error;
  return response.data;
}

/**
 * Explicit save of the authored draft (create-on-first-save). Own version
 * lock — draft saves deliberately never touch `web.page.version`, so they can
 * never fail an intent save.
 */
export async function savePageContent(
  input: SavePageContentInput,
): Promise<PageContent> {
  const db = await authenticatedWebDb(supabase);
  if (input.expectedVersion === null) {
    const response = await db
      .from("page_content")
      .insert({
        site_id: input.siteId,
        page_id: input.pageId,
        content: input.content,
      })
      .select("*")
      .maybeSingle();
    if (response.error) throw response.error;
    if (!response.data) throw new Error("Draft create returned no row.");
    return response.data;
  }
  return guardedUpdateOrThrow<PageContent>({
    expectedVersion: input.expectedVersion,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("page_content")
        .update({ content: input.content, version: nextVersion })
        .eq("site_id", input.siteId)
        .eq("page_id", input.pageId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("page_content")
        .select("*")
        .eq("site_id", input.siteId)
        .eq("page_id", input.pageId)
        .is("deleted_at", null)
        .maybeSingle(),
    conflictMessage:
      "This draft changed in another session. Reload and try again.",
  });
}

export async function listSnapshots(
  siteId: string,
  pageId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<PagedResult<PageSnapshot>> {
  const { from, to } = rangeFor(state);
  const sortColumns = {
    captured_at: "captured_at",
    final_url: "final_url",
    http_status: "http_status",
    word_count: "word_count",
    content_hash: "content_hash",
  } as const;
  const requestedSort = state.sort?.id ?? "captured_at";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "captured_at";
  const ascending = state.sort?.direction === "asc";
  let query = (await authenticatedWebDb(supabase))
    .from("snapshot")
    .select(SNAPSHOT_COLUMNS, { count: "exact" })
    .eq("site_id", siteId)
    .eq("page_id", pageId);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `final_url.ilike.%${search}%,content_hash.ilike.%${search}%`,
    );
  }
  const finalUrl = textFilter(state, "final_url");
  const hash = textFilter(state, "content_hash");
  const http = numberFilter(state, "http_status");
  const words = numberFilter(state, "word_count");
  if (finalUrl) query = query.ilike("final_url", `%${finalUrl}%`);
  if (hash) query = query.ilike("content_hash", `%${hash}%`);
  if (http?.min !== undefined) query = query.gte("http_status", http.min);
  if (http?.max !== undefined) query = query.lte("http_status", http.max);
  if (words?.min !== undefined) query = query.gte("word_count", words.min);
  if (words?.max !== undefined) query = query.lte("word_count", words.max);
  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

export async function getSnapshot(
  siteId: string,
  pageId: string,
  snapshotId: string,
  signal?: AbortSignal,
): Promise<PageSnapshot> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("snapshot")
    .select(SNAPSHOT_COLUMNS)
    .eq("site_id", siteId)
    .eq("page_id", pageId)
    .eq("id", snapshotId)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  return assertFound(
    response.data,
    response.error,
    "snapshot",
    snapshotId,
    "web_snapshot",
  );
}

export async function listCrawls(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<PagedResult<CrawlSession>> {
  const { from, to } = rangeFor(state);
  const sortColumns = {
    status: "status",
    trigger: "trigger",
    started_at: "started_at",
    finished_at: "finished_at",
    created_at: "created_at",
  } as const;
  const requestedSort = state.sort?.id ?? "started_at";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "started_at";
  const ascending = state.sort?.direction === "asc";
  let query = (await authenticatedWebDb(supabase))
    .from("crawl_session")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, status, trigger, scope, stats, started_at, finished_at, error",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .is("deleted_at", null);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `status.ilike.%${search}%,trigger.ilike.%${search}%,error.ilike.%${search}%`,
    );
  }
  const status = selectFilter(state, "status");
  const trigger = selectFilter(state, "trigger");
  if (status) query = query.eq("status", status);
  if (trigger) query = query.eq("trigger", trigger);
  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

/**
 * Every session that still owns work for this site — the site-wide crawl AND
 * the command sessions (analysis, sitemap sync, GSC sync, link check, page
 * fetch). This is the durable answer to "what is running right now", which is
 * what lets a reloaded tab rejoin a run instead of showing a blank panel.
 *
 * Deliberately a LIST: several commands can be in flight at once, and taking
 * only the newest row is what used to make a GSC sync read as a crawl.
 */
export async function listActiveCrawlSessions(
  siteId: string,
  signal?: AbortSignal,
): Promise<CrawlSession[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("crawl_session")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, status, trigger, scope, stats, started_at, finished_at, error",
    )
    .eq("site_id", siteId)
    .in("status", ["queued", "running"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export async function getCrawl(
  siteId: string,
  crawlId: string,
  signal?: AbortSignal,
): Promise<CrawlSession> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("crawl_session")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, status, trigger, scope, stats, started_at, finished_at, error",
    )
    .eq("site_id", siteId)
    .eq("id", crawlId)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  return assertFound(
    response.data,
    response.error,
    "crawl session",
    crawlId,
    "web_crawl_session",
  );
}

export async function listCrawlUrls(
  siteId: string,
  crawlId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<PagedResult<CrawlUrl>> {
  const { from, to } = rangeFor(state);
  const sortColumns = {
    sequence: "sequence",
    raw_url: "raw_url",
    classification: "classification",
    outcome: "outcome",
    discovery_source: "discovery_source",
    depth: "depth",
    http_status: "http_status",
    final_url: "final_url",
    reason_code: "reason_code",
    reason: "reason",
    is_in_scope: "is_in_scope",
    discovered_at: "discovered_at",
    completed_at: "completed_at",
  } as const;
  const requestedSort = state.sort?.id ?? "sequence";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "sequence";
  const ascending = state.sort?.direction === "asc";
  let query = (await authenticatedWebDb(supabase))
    .from("crawl_url")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, session_id, sequence, page_id, snapshot_id, discovered_from_page_id, raw_url, normalized_url, url_hash, discovery_source, classification, outcome, is_in_scope, depth, http_status, final_url, reason_code, reason, discovered_at, completed_at",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .eq("session_id", crawlId)
    .is("deleted_at", null);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `raw_url.ilike.%${search}%,normalized_url.ilike.%${search}%,final_url.ilike.%${search}%,reason.ilike.%${search}%`,
    );
  }
  const rawUrl = textFilter(state, "raw_url");
  const finalUrl = textFilter(state, "final_url");
  const reasonCode = textFilter(state, "reason_code");
  const reason = textFilter(state, "reason");
  const outcome = selectFilter(state, "outcome");
  const classification = selectFilter(state, "classification");
  const source = selectFilter(state, "discovery_source");
  const sequence = numberFilter(state, "sequence");
  const depth = numberFilter(state, "depth");
  const http = numberFilter(state, "http_status");
  const isInScope = booleanFilter(state, "is_in_scope");
  if (rawUrl) query = query.ilike("raw_url", `%${rawUrl}%`);
  if (finalUrl) query = query.ilike("final_url", `%${finalUrl}%`);
  if (reasonCode) query = query.ilike("reason_code", `%${reasonCode}%`);
  if (reason) query = query.ilike("reason", `%${reason}%`);
  if (outcome) query = query.eq("outcome", outcome);
  if (classification) query = query.eq("classification", classification);
  if (source) query = query.eq("discovery_source", source);
  if (sequence?.min !== undefined) query = query.gte("sequence", sequence.min);
  if (sequence?.max !== undefined) query = query.lte("sequence", sequence.max);
  if (depth?.min !== undefined) query = query.gte("depth", depth.min);
  if (depth?.max !== undefined) query = query.lte("depth", depth.max);
  if (http?.min !== undefined) query = query.gte("http_status", http.min);
  if (http?.max !== undefined) query = query.lte("http_status", http.max);
  if (isInScope !== null) query = query.eq("is_in_scope", isInScope);
  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

const LIVE_CRAWL_EVENT_TYPES = [
  "crawl_session_created",
  "crawl_started",
  "page_discovered",
  "url_classified",
  "page_fetched",
  "page_failed",
  "crawl_progress",
  "issue_detected",
  "crawl_completed",
  "crawl_warning",
  "initialize_step",
] as const;

/**
 * Catch-up feed for an active crawl. Deliberately excludes page_parsed: its
 * payload can contain an entire document and the live UI never renders it.
 */
export async function listRecentLiveCrawlEvents(
  siteId: string,
  crawlId: string,
  signal?: AbortSignal,
): Promise<CrawlEvent[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("crawl_event")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, session_id, sequence, event_type, phase, level, message, page_id, crawl_url_id, payload, occurred_at",
    )
    .eq("site_id", siteId)
    .eq("session_id", crawlId)
    .in("event_type", [...LIVE_CRAWL_EVENT_TYPES])
    .is("deleted_at", null)
    .order("sequence", { ascending: false })
    .limit(250)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error).reverse();
}

export async function listCrawlEvents(
  siteId: string,
  crawlId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<PagedResult<CrawlEvent>> {
  const { from, to } = rangeFor(state);
  const sortColumns = {
    sequence: "sequence",
    occurred_at: "occurred_at",
    event_type: "event_type",
    phase: "phase",
    level: "level",
  } as const;
  const requestedSort = state.sort?.id ?? "sequence";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "sequence";
  const ascending = state.sort?.direction !== "desc";
  let query = (await authenticatedWebDb(supabase))
    .from("crawl_event")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, session_id, sequence, event_type, phase, level, message, page_id, crawl_url_id, payload, occurred_at",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .eq("session_id", crawlId)
    .is("deleted_at", null);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `event_type.ilike.%${search}%,phase.ilike.%${search}%,level.ilike.%${search}%,message.ilike.%${search}%`,
    );
  }
  const eventType = textFilter(state, "event_type");
  const phase = textFilter(state, "phase");
  const level = selectFilter(state, "level");
  const sequence = numberFilter(state, "sequence");
  if (eventType) query = query.ilike("event_type", `%${eventType}%`);
  if (phase) query = query.ilike("phase", `%${phase}%`);
  if (level) query = query.eq("level", level);
  if (sequence?.min !== undefined) query = query.gte("sequence", sequence.min);
  if (sequence?.max !== undefined) query = query.lte("sequence", sequence.max);
  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

// ============================================================================
// Brand layer — identity, screenshots, and the discovery inbox
// ============================================================================

/** Version-checked direct update of user-editable site identity fields. */
export async function updateSiteIdentity(
  input: UpdateSiteIdentityInput,
): Promise<MarketingSite> {
  const db = await authenticatedWebDb(supabase);
  return guardedUpdateOrThrow<MarketingSite>({
    expectedVersion: input.expectedVersion,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("site")
        .update({ ...input.patch, version: nextVersion })
        .eq("id", input.siteId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(SITE_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("site")
        .select(SITE_COLUMNS)
        .eq("id", input.siteId)
        .is("deleted_at", null)
        .maybeSingle(),
    conflictMessage:
      "This site changed in another session. Reload and try again.",
  });
}

const SCREENSHOT_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, page_id, snapshot_id, kind, width, height, captured_at, file_id";

/** Read the above-the-fold homepage hero capture. */
export async function getSiteHeroScreenshot(
  siteId: string,
  rootUrl: string,
  screenshotId: string | null,
  signal?: AbortSignal,
): Promise<SiteScreenshot | null> {
  const db = await authenticatedWebDb(supabase);
  const abort = signal ?? new AbortController().signal;
  if (screenshotId) {
    const response = await db
      .from("screenshot")
      .select(SCREENSHOT_COLUMNS)
      .eq("id", screenshotId)
      .eq("site_id", siteId)
      .eq("kind", "homepage")
      .is("deleted_at", null)
      .abortSignal(abort)
      .maybeSingle();
    if (response.error) throw response.error;
    if (response.data) return response.data;
    // Pointer dangles (capture deleted, or pre-pointer bootstrap) — fall
    // through to the newest live homepage-family capture instead of an
    // empty hero forever.
  }

  const homepagePageResponse = await db
    .from("page")
    .select("id")
    .eq("site_id", siteId)
    .eq("url", rootUrl)
    .is("deleted_at", null)
    .abortSignal(abort)
    .maybeSingle();
  if (homepagePageResponse.error) throw homepagePageResponse.error;

  const homepagePageId = homepagePageResponse.data?.id ?? null;
  if (homepagePageId) {
    // Initialize persists responsive kinds on `/` and deliberately does not
    // stamp site.homepage_screenshot_id (DB guard requires kind=homepage).
    for (const kind of ["desktop_fold", "mobile_fold"] as const) {
      const fold = await db
        .from("screenshot")
        .select(SCREENSHOT_COLUMNS)
        .eq("site_id", siteId)
        .eq("page_id", homepagePageId)
        .eq("kind", kind)
        .is("deleted_at", null)
        .order("captured_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(1)
        .abortSignal(abort)
        .maybeSingle();
      if (fold.error) throw fold.error;
      if (fold.data) return fold.data;
    }
  }

  const legacy = await db
    .from("screenshot")
    .select(SCREENSHOT_COLUMNS)
    .eq("site_id", siteId)
    .in("kind", ["homepage", "viewport"])
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(1)
    .abortSignal(abort)
    .maybeSingle();
  if (legacy.error) throw legacy.error;
  return legacy.data;
}

const DISCOVERED_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, brand_id, site_id, snapshot_id, source, category, guessed_kind, url, value, value_hash, context, confidence, status, resolved_asset_id, resolved_fact_id, resolved_property_id, reviewed_by, reviewed_at";

/**
 * Discovery inbox for a brand, optionally narrowed by status. Controlled
 * pagination with a true total — never a silent cap. Ordering ends in the
 * unique `id` so pages are stable while rows share a category/confidence.
 */
export async function listDiscoveredItems(
  brandId: string,
  status: DiscoveredItemStatus | null,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<PagedResult<DiscoveredItem>> {
  const db = await authenticatedWebDb(supabase);
  let query = db
    .from("discovered_item")
    .select(DISCOVERED_COLUMNS, { count: "exact" })
    .eq("brand_id", brandId)
    .is("deleted_at", null);
  if (status) query = query.eq("status", status);
  const from = (page - 1) * pageSize;
  const response = await query
    .order("category", { ascending: true })
    .order("confidence", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1)
    .abortSignal(signal ?? new AbortController().signal);
  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

export async function countPendingDiscovered(
  brandId: string,
  signal?: AbortSignal,
): Promise<number> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("discovered_item")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return response.count ?? 0;
}

/** Promote a discovered item to a confirmed brand asset. */
export async function confirmDiscoveredAsset(
  input: ConfirmAssetInput,
): Promise<void> {
  const db = await authenticatedWebDb(supabase);
  const asset = await db
    .from("brand_asset")
    .insert({
      organization_id: input.item.organization_id,
      brand_id: input.item.brand_id,
      kind: input.assetKind,
      source_url: input.item.url,
      title: input.title,
      source: "discovered",
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const created = assertData(asset.data, asset.error);
  const identityPatch =
    input.assetKind === "logo"
      ? { logo_url: input.item.url }
      : input.assetKind === "favicon"
        ? { favicon_url: input.item.url }
        : input.assetKind === "og_image" || input.assetKind === "twitter_image"
          ? { og_image_url: input.item.url }
          : null;
  if (identityPatch && input.item.url) {
    const brandUpdate = await db
      .from("brand")
      .update(identityPatch)
      .eq("id", input.item.brand_id)
      .is("deleted_at", null);
    if (brandUpdate.error) throw brandUpdate.error;
    if (input.item.site_id) {
      const siteUpdate = await db
        .from("site")
        .update(identityPatch)
        .eq("id", input.item.site_id)
        .is("deleted_at", null);
      if (siteUpdate.error) throw siteUpdate.error;
    }
  }
  const update = await db
    .from("discovered_item")
    .update({
      status: "confirmed",
      resolved_asset_id: created.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.item.id)
    .eq("status", "pending");
  if (update.error) throw update.error;
}

/** Promote a social discovery to the brand-property model it renders in. */
export async function confirmDiscoveredProperty(
  input: ConfirmPropertyInput,
): Promise<void> {
  if (!input.item.url) {
    throw new Error("A social property discovery needs a URL.");
  }
  const db = await authenticatedWebDb(supabase);
  const property = await db
    .from("property")
    .insert({
      organization_id: input.item.organization_id,
      brand_id: input.item.brand_id,
      kind: input.propertyKind,
      url: input.item.url,
      display_name: input.displayName,
      status: "active",
      metadata: { source_discovery_id: input.item.id },
    })
    .select("id")
    .single();
  const created = assertData(property.data, property.error);
  const update = await db
    .from("discovered_item")
    .update({
      status: "confirmed",
      resolved_property_id: created.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.item.id)
    .eq("status", "pending");
  if (update.error) throw update.error;
}

/** Promote a discovered item to a confirmed business fact. */
export async function confirmDiscoveredFact(
  input: ConfirmFactInput,
): Promise<void> {
  const db = await authenticatedWebDb(supabase);
  const fact = await db
    .from("business_fact")
    .insert({
      organization_id: input.item.organization_id,
      brand_id: input.item.brand_id,
      kind: input.factKind,
      label: input.label,
      value: input.item.url
        ? { url: input.item.url, ...asRecord(input.item.value) }
        : input.item.value,
      source: "discovered",
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const created = assertData(fact.data, fact.error);
  const update = await db
    .from("discovered_item")
    .update({
      status: "confirmed",
      resolved_fact_id: created.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.item.id)
    .eq("status", "pending");
  if (update.error) throw update.error;
}

function asRecord(value: DiscoveredItem["value"]): { [key: string]: unknown } {
  return isJsonRecord(value) ? value : {};
}

export interface BulkConfirmDiscoveredResult {
  confirmed: number;
  failed: Array<{ item: DiscoveredItem; message: string }>;
}

/**
 * Promote many pending discoveries at once. Each item goes through the ONE
 * canonical per-category promotion path (asset / property / fact) — never a
 * second bulk write shape. Sequential on purpose: a promotion is a
 * multi-statement write (insert + identity sync + status stamp) and a partial
 * failure must name exactly which items failed instead of aborting the batch.
 */
export async function bulkConfirmDiscoveredItems(
  items: Array<{ item: DiscoveredItem; kind: string; label: string | null }>,
): Promise<BulkConfirmDiscoveredResult> {
  let confirmed = 0;
  const failed: BulkConfirmDiscoveredResult["failed"] = [];
  for (const { item, kind, label } of items) {
    try {
      if (item.category === "media") {
        await confirmDiscoveredAsset({ item, assetKind: kind, title: label });
      } else if (item.category === "social") {
        if (!isPropertyKind(kind) || kind === "website") {
          throw new Error("Select a valid property type.");
        }
        await confirmDiscoveredProperty({
          item,
          propertyKind: kind,
          displayName: label,
        });
      } else {
        await confirmDiscoveredFact({ item, factKind: kind, label });
      }
      confirmed += 1;
    } catch (error) {
      failed.push({ item, message: extractErrorMessage(error) });
    }
  }
  return { confirmed, failed };
}

/** Dismiss many pending candidates in one statement. Returns rows changed. */
export async function bulkDismissDiscoveredItems(
  itemIds: string[],
): Promise<number> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("discovered_item")
    .update({ status: "dismissed", reviewed_at: new Date().toISOString() })
    .in("id", itemIds)
    .eq("status", "pending")
    .select("id");
  assertMutated(response.data, response.error, "dismiss these discoveries");
  return response.data?.length ?? 0;
}

/** Return many dismissed candidates to pending in one statement. */
export async function bulkUndismissDiscoveredItems(
  itemIds: string[],
): Promise<number> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("discovered_item")
    .update({ status: "pending", reviewed_at: null, reviewed_by: null })
    .in("id", itemIds)
    .eq("status", "dismissed")
    .select("id");
  assertMutated(response.data, response.error, "restore these discoveries");
  return response.data?.length ?? 0;
}

/** Soft-delete many candidates in one statement. Returns rows changed. */
export async function bulkDeleteDiscoveredItems(
  itemIds: string[],
): Promise<number> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("discovered_item")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", itemIds)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete these discoveries");
  return response.data?.length ?? 0;
}

export async function dismissDiscoveredItem(itemId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("discovered_item")
    .update({ status: "dismissed", reviewed_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("status", "pending");
  if (response.error) throw response.error;
}

// ============================================================================
// Brands — the anchor entity's own reads
// ============================================================================

const BRAND_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, name, description, website_url, logo_url, favicon_url, og_image_url, industry, notes, status, visibility, settings, profile";

export async function listBrands(
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<PagedResult<BrandListRow>> {
  const db = await authenticatedWebDb(supabase);
  const { from, to } = rangeFor(state);
  const sortColumns = {
    name: "name",
    status: "status",
    updated_at: "updated_at",
    created_at: "created_at",
  } as const;
  const requestedSort = state.sort?.id ?? "name";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "name";
  const ascending = state.sort?.direction !== "desc";

  let query = db
    .from("brand")
    .select(BRAND_COLUMNS, { count: "exact" })
    .is("deleted_at", null);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(`name.ilike.%${search}%,website_url.ilike.%${search}%`);
  }
  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  const brands = assertData(response.data, response.error);
  if (brands.length === 0) return { rows: [], total: response.count ?? 0 };

  const brandIds = brands.map((brand) => brand.id);
  const abortSignal = signal ?? new AbortController().signal;
  const [
    sitesResponse,
    pendingResponse,
    propertiesResponse,
    assetsResponse,
    factsResponse,
  ] = await Promise.all([
    db
      .from("site")
      .select(
        "id, brand_id, name, domain, favicon_url, logo_url, initialized_at",
      )
      .in("brand_id", brandIds)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .abortSignal(abortSignal),
    db
      .from("discovered_item")
      .select("brand_id")
      .in("brand_id", brandIds)
      .eq("status", "pending")
      .is("deleted_at", null)
      .abortSignal(abortSignal),
    db
      .from("property")
      .select("brand_id, kind")
      .in("brand_id", brandIds)
      .neq("kind", "website")
      .is("deleted_at", null)
      .abortSignal(abortSignal),
    db
      .from("brand_asset")
      .select("brand_id")
      .in("brand_id", brandIds)
      .is("deleted_at", null)
      .abortSignal(abortSignal),
    db
      .from("business_fact")
      .select("brand_id")
      .in("brand_id", brandIds)
      .is("deleted_at", null)
      .abortSignal(abortSignal),
  ]);
  const sites = assertData(sitesResponse.data, sitesResponse.error);
  const pending = assertData(pendingResponse.data, pendingResponse.error);
  const sitesByBrand = new Map<string, BrandListRow["sites"]>();
  for (const site of sites) {
    if (!site.brand_id) continue;
    const bucket = sitesByBrand.get(site.brand_id) ?? [];
    bucket.push(site);
    sitesByBrand.set(site.brand_id, bucket);
  }
  const pendingByBrand = new Map<string, number>();
  for (const item of pending) {
    pendingByBrand.set(
      item.brand_id,
      (pendingByBrand.get(item.brand_id) ?? 0) + 1,
    );
  }
  const countBy = (rowsWithBrand: Array<{ brand_id: string }>) => {
    const map = new Map<string, number>();
    for (const row of rowsWithBrand) {
      map.set(row.brand_id, (map.get(row.brand_id) ?? 0) + 1);
    }
    return map;
  };
  const socialsByBrand = countBy(
    assertData(propertiesResponse.data, propertiesResponse.error),
  );
  const assetsByBrand = countBy(
    assertData(assetsResponse.data, assetsResponse.error),
  );
  const factsByBrand = countBy(
    assertData(factsResponse.data, factsResponse.error),
  );

  return {
    rows: brands.map((brand) => ({
      ...brand,
      sites: sitesByBrand.get(brand.id) ?? [],
      pending_discovered: pendingByBrand.get(brand.id) ?? 0,
      social_count: socialsByBrand.get(brand.id) ?? 0,
      asset_count: assetsByBrand.get(brand.id) ?? 0,
      fact_count: factsByBrand.get(brand.id) ?? 0,
    })),
    total: response.count ?? 0,
  };
}

export async function getBrand(
  brandId: string,
  signal?: AbortSignal,
): Promise<MarketingBrand> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const response = await db
    .from("brand")
    .select(BRAND_COLUMNS)
    .eq("id", brandId)
    .is("deleted_at", null)
    .abortSignal(abortSignal)
    .maybeSingle();
  return assertFoundOrProbeDeleted(
    response.data,
    response.error,
    "brand",
    brandId,
    () =>
      db
        .from("brand")
        .select("deleted_at")
        .eq("id", brandId)
        .abortSignal(abortSignal)
        .maybeSingle(),
    "web_brand",
  );
}

export async function listBrandSites(
  brandId: string,
  signal?: AbortSignal,
): Promise<MarketingSite[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("site")
    .select(SITE_COLUMNS)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

const PROPERTY_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, brand_id, kind, url, handle, display_name, status, site_id, connection, settings";

export async function listBrandProperties(
  brandId: string,
  signal?: AbortSignal,
): Promise<BrandProperty[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("property")
    .select(PROPERTY_COLUMNS)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("kind", { ascending: true })
    .order("created_at", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

const BRAND_ASSET_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, brand_id, kind, file_id, source_url, title, notes, source, is_primary, sort_order, data, confirmed_by, confirmed_at";

export async function listBrandAssets(
  brandId: string,
  signal?: AbortSignal,
): Promise<BrandAsset[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("brand_asset")
    .select(BRAND_ASSET_COLUMNS)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

const BUSINESS_FACT_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, brand_id, kind, label, value, source, confirmed_by, confirmed_at";

export async function listBusinessFacts(
  brandId: string,
  signal?: AbortSignal,
): Promise<BusinessFact[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("business_fact")
    .select(BUSINESS_FACT_COLUMNS)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("kind", { ascending: true })
    .order("created_at", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

// ============================================================================
// Sitemaps — first-class sitemap documents + page membership evidence
// ============================================================================

const SITEMAP_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, url, kind, parent_sitemap_id, status_code, url_count, child_count, is_active, first_seen, last_seen, last_fetched_at, fetch_error";

/** All sitemap documents for a site (bounded; a site has dozens, not thousands). */
export async function listSitemaps(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteSitemap[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("sitemap")
    .select(SITEMAP_COLUMNS)
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("kind", { ascending: false })
    .order("url", { ascending: true })
    .limit(500)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export async function getSitemap(
  siteId: string,
  sitemapId: string,
  signal?: AbortSignal,
): Promise<SiteSitemap> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("sitemap")
    .select(SITEMAP_COLUMNS)
    .eq("site_id", siteId)
    .eq("id", sitemapId)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  return assertFound(
    response.data,
    response.error,
    "sitemap",
    sitemapId,
    "web_sitemap",
  );
}

export type SitemapPagesFilter = "all" | "never_crawled";

/** Pages listed in one sitemap, joined with canonical-page state. */
export async function listSitemapPages(
  siteId: string,
  sitemapId: string,
  state: MatrxDataTableQueryState,
  filter: SitemapPagesFilter,
  signal?: AbortSignal,
): Promise<PagedResult<SitemapPageRow>> {
  const db = await authenticatedWebDb(supabase);
  const { from, to } = rangeFor(state);
  const abortSignal = signal ?? new AbortController().signal;

  let query = db
    .from("page_sitemap")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, page_id, sitemap_id, lastmod, changefreq, priority, first_seen, last_seen, page:page_id!inner(id, url, path, status, provenance, http_status_last, latest_snapshot_id, last_seen)",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .eq("sitemap_id", sitemapId)
    .is("deleted_at", null);
  if (filter === "never_crawled") {
    query = query.is("page.latest_snapshot_id", null);
  }
  const search = cleanSearch(state.search);
  if (search) query = query.ilike("page.url", `%${search}%`);

  const ascending = state.sort?.direction === "asc";
  if (state.sort?.id === "lastmod") {
    query = query.order("lastmod", { ascending, nullsFirst: false });
  } else {
    query = query.order("url", {
      referencedTable: "page",
      ascending: state.sort?.id === "page" ? ascending : true,
    });
  }
  query = query.order("id", { ascending: true });

  const response = await query.range(from, to).abortSignal(abortSignal);
  const rows = assertData(response.data, response.error);
  if (rows.length === 0) return { rows: [], total: response.count ?? 0 };

  // Batched membership counts: 1 = only in this sitemap.
  const countsResponse = await db
    .from("page_sitemap")
    .select("page_id")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .in(
      "page_id",
      rows.map((row) => row.page_id),
    )
    .abortSignal(abortSignal);
  const counts = assertData(countsResponse.data, countsResponse.error);
  const byPage = new Map<string, number>();
  for (const row of counts) {
    byPage.set(row.page_id, (byPage.get(row.page_id) ?? 0) + 1);
  }

  return {
    rows: rows.map((row) => ({
      ...row,
      membership_count: byPage.get(row.page_id) ?? 1,
    })),
    total: response.count ?? 0,
  };
}

/** Site-level sitemap coverage stats for the sitemaps workspace header. */
export async function getSitemapCoverage(
  siteId: string,
  signal?: AbortSignal,
): Promise<SitemapCoverage> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const [sitemaps, memberships, latest] = await Promise.all([
    db
      .from("sitemap")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .abortSignal(abortSignal),
    db
      .from("page_sitemap")
      .select("page_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .abortSignal(abortSignal),
    db
      .from("sitemap")
      .select("last_fetched_at")
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .order("last_fetched_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .abortSignal(abortSignal)
      .maybeSingle(),
  ]);
  if (sitemaps.error) throw sitemaps.error;
  if (memberships.error) throw memberships.error;
  if (latest.error) throw latest.error;

  const neverCrawled = await db
    .from("page_sitemap")
    .select("id, page:page_id!inner(latest_snapshot_id)", {
      count: "exact",
      head: true,
    })
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .is("page.latest_snapshot_id", null)
    .abortSignal(abortSignal);
  if (neverCrawled.error) throw neverCrawled.error;

  return {
    sitemaps: sitemaps.count ?? 0,
    pagesInSitemaps: memberships.count ?? 0,
    neverCrawled: neverCrawled.count ?? 0,
    lastSyncedAt: latest.data?.last_fetched_at ?? null,
  };
}

// ============================================================================
// Brand CRUD — full user control over everything user-editable
// ============================================================================

export async function createBrand(
  input: CreateBrandInput,
): Promise<MarketingBrand> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("brand")
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      industry: input.industry,
      description: input.description,
      website_url: input.websiteUrl,
      logo_url: input.logoUrl,
      favicon_url: input.faviconUrl,
      og_image_url: input.ogImageUrl,
      notes: input.notes,
      status: input.status,
      // Omitted visibility inherits the web.brand column default
      // (platform.entity_default_visibility('web_brand')).
      ...(input.visibility !== undefined
        ? { visibility: input.visibility }
        : {}),
      ...(input.profile !== undefined ? { profile: input.profile } : {}),
    })
    .select(BRAND_COLUMNS)
    .single();
  return assertData(response.data, response.error);
}

export async function updateBrand(
  input: UpdateBrandInput,
): Promise<MarketingBrand> {
  const db = await authenticatedWebDb(supabase);
  return guardedUpdateOrThrow<MarketingBrand>({
    expectedVersion: input.expectedVersion,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("brand")
        .update({ ...input.patch, version: nextVersion })
        .eq("id", input.brandId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(BRAND_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("brand")
        .select(BRAND_COLUMNS)
        .eq("id", input.brandId)
        .is("deleted_at", null)
        .maybeSingle(),
    conflictMessage:
      "This brand changed in another session. Reload and try again.",
  });
}

/**
 * Soft-delete a brand. Refuses while live sites or properties still point at
 * it — deleting the anchor out from under its children would orphan them
 * silently. These preflights give friendly copy; the DB trigger
 * `web.brand_soft_delete_guard` enforces the same rule atomically.
 */
export async function deleteBrand(brandId: string): Promise<void> {
  const db = await authenticatedWebDb(supabase);
  const sites = await db
    .from("site")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .is("deleted_at", null);
  if (sites.error) throw sites.error;
  if (sites.count) {
    throw new Error(
      `This brand still owns ${sites.count} site${sites.count === 1 ? "" : "s"}. Delete or move its sites first.`,
    );
  }
  const properties = await db
    .from("property")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .is("deleted_at", null);
  if (properties.error) throw properties.error;
  if (properties.count) {
    throw new Error(
      `This brand still owns ${properties.count} propert${properties.count === 1 ? "y" : "ies"} (social accounts or other presences). Delete them first.`,
    );
  }
  const response = await db
    .from("brand")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", brandId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete this brand");
}

/**
 * Soft-delete a site (its crawl history stays; the row leaves every list).
 * The DB trigger `web.site_cascade_website_property` soft-deletes the site's
 * `property(kind='website')` row in the same statement, so the two lifecycle
 * authorities can never drift.
 */
export async function deleteSite(siteId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("site")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", siteId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete this site");
}

// ============================================================================
// Pages — manual registration + soft-delete
// ============================================================================

/**
 * Manually register a canonical page (provenance 'manual'). Normalizes and
 * hashes the URL exactly like the scraper so `(site_id, url_hash)` dedupes
 * against sitemap/GSC/crawl-written rows.
 */
export async function createManualPage(
  input: CreateManualPageInput,
): Promise<MarketingPage> {
  const normalized = normalisePageUrl(input.url);
  const digest = await pageUrlHash(normalized);
  const pageId = crypto.randomUUID();
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("page")
    .insert({
      // A new page is its own canonical page. The DB trigger
      // `web.default_page_canonical_identity` would fill this from `id` on its
      // own, but `canonical_page_id` is NOT NULL with no column default, so the
      // generated Insert type requires it — mint the id here and state the
      // self-canonical intent explicitly rather than leaving it to a trigger the
      // type system cannot see.
      id: pageId,
      canonical_page_id: pageId,
      organization_id: input.organizationId,
      site_id: input.siteId,
      url: normalized,
      url_hash: digest,
      path: pagePathOf(normalized),
      provenance: "manual",
      status: "active",
    })
    .select(PAGE_COLUMNS)
    .single();
  if (response.error?.code === "23505") {
    // `(site_id, url_hash)` is a plain unique (the scraper's ON CONFLICT
    // arbiter), so it also collides with soft-deleted rows the user cannot
    // see. Re-adding a previously deleted URL restores that row instead of
    // dead-ending on "already exists" (the site-domain soft-delete-squatting
    // bug class).
    const restore = await (
      await authenticatedWebDb(supabase)
    )
      .from("page")
      .update({ deleted_at: null, status: "active" })
      .eq("site_id", input.siteId)
      .eq("url_hash", digest)
      .not("deleted_at", "is", null)
      .select(PAGE_COLUMNS)
      .maybeSingle();
    if (restore.error) throw restore.error;
    if (restore.data) return restore.data;
    throw new Error(`${normalized} is already in this site's page registry.`);
  }
  return assertData(response.data, response.error);
}

/**
 * DISMISS a canonical page (soft `deleted_at`). The crawler represents
 * reality (Arman, 2026-08-08): this hides the row from primary views — it is
 * not history-rewriting, and a future crawl/sitemap/GSC observation revives
 * the row with `metadata.dismissals` stamped by the server. Snapshots and
 * evidence stay untouched.
 */
export async function dismissPage(
  siteId: string,
  pageId: string,
): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("page")
    .update({ deleted_at: new Date().toISOString() })
    .eq("site_id", siteId)
    .eq("id", pageId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "dismiss this page");
}

/** Return a dismissed page to the registry without waiting for a re-crawl. */
export async function restorePage(
  siteId: string,
  pageId: string,
): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("page")
    .update({ deleted_at: null })
    .eq("site_id", siteId)
    .eq("id", pageId)
    .not("deleted_at", "is", null)
    .select("id");
  assertMutated(response.data, response.error, "restore this page");
}

/**
 * Dismissed canonical pages for one site — the deliberate "Dismissed" scope
 * (`?scope=dismissed` on the Pages route), never a default view. Queries
 * `web.page` directly because `v_page_list` (correctly) excludes dismissed
 * rows from the primary projection.
 */
export async function listDismissedPages(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<PagedResult<MarketingPage>> {
  const db = await authenticatedWebDb(supabase);
  const { from, to } = rangeFor(state);
  const sortColumns = {
    url: "url",
    path: "path",
    provenance: "provenance",
    dismissed_at: "deleted_at",
    last_seen: "last_seen",
  } as const;
  const requestedSort = state.sort?.id ?? "dismissed_at";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "deleted_at";
  const ascending = state.sort?.direction === "asc" && requestedSort in sortColumns;

  let query = db
    .from("page")
    .select(PAGE_COLUMNS, { count: "exact" })
    .eq("site_id", siteId)
    .not("deleted_at", "is", null);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `url.ilike.%${search}%,path.ilike.%${search}%,target_keyword.ilike.%${search}%`,
    );
  }
  const url = textFilter(state, "url");
  const path = textFilter(state, "path");
  const provenances = selectFilterValues(state, "provenance");
  if (url) query = query.ilike("url", `%${url}%`);
  if (path) query = query.ilike("path", `%${path}%`);
  if (provenances.length === 1) query = query.eq("provenance", provenances[0]);
  if (provenances.length > 1) query = query.in("provenance", provenances);

  query = query
    .order(sortColumn, { ascending, nullsFirst: false })
    .order("id", { ascending: true });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

// ============================================================================
// Sitemaps — activation + soft-delete (documents are user-manageable;
// page_sitemap membership evidence is system-written and only cascades here)
// ============================================================================

/** Toggle whether a sitemap document participates in syncs/coverage. */
export async function setSitemapActive(
  siteId: string,
  sitemapId: string,
  isActive: boolean,
): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("sitemap")
    .update({ is_active: isActive })
    .eq("site_id", siteId)
    .eq("id", sitemapId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "change this sitemap");
}

/**
 * DISMISS a sitemap document (soft `deleted_at`) AND its membership evidence —
 * orphaned `page_sitemap` rows would keep counting pages as "in a sitemap"
 * that is hidden. The crawler represents reality (Arman, 2026-08-08): a future
 * sync that re-observes the document revives both, stamping
 * `metadata.dismissals` on the sitemap row server-side.
 */
export async function dismissSitemap(
  siteId: string,
  sitemapId: string,
): Promise<void> {
  const db = await authenticatedWebDb(supabase);
  const now = new Date().toISOString();
  const memberships = await db
    .from("page_sitemap")
    .update({ deleted_at: now })
    .eq("site_id", siteId)
    .eq("sitemap_id", sitemapId)
    .is("deleted_at", null);
  if (memberships.error) throw memberships.error;
  const response = await db
    .from("sitemap")
    .update({ deleted_at: now })
    .eq("site_id", siteId)
    .eq("id", sitemapId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "dismiss this sitemap");
}

/**
 * Restore a dismissed sitemap without waiting for a re-sync. Membership
 * evidence is only ever soft-deleted by the dismiss cascade above (it is
 * system-managed otherwise), so restoring every soft-deleted membership of
 * this sitemap reverses exactly that cascade.
 */
export async function restoreSitemap(
  siteId: string,
  sitemapId: string,
): Promise<void> {
  const db = await authenticatedWebDb(supabase);
  const response = await db
    .from("sitemap")
    .update({ deleted_at: null })
    .eq("site_id", siteId)
    .eq("id", sitemapId)
    .not("deleted_at", "is", null)
    .select("id");
  assertMutated(response.data, response.error, "restore this sitemap");
  const memberships = await db
    .from("page_sitemap")
    .update({ deleted_at: null })
    .eq("site_id", siteId)
    .eq("sitemap_id", sitemapId)
    .not("deleted_at", "is", null);
  if (memberships.error) throw memberships.error;
}

/** Dismissed sitemap documents — the deliberate "Dismissed" view, never default. */
export async function listDismissedSitemaps(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteSitemap[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("sitemap")
    .select(SITEMAP_COLUMNS)
    .eq("site_id", siteId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(200)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

// ============================================================================
// Discovery inbox — delete + un-dismiss (review verbs live above)
// ============================================================================

/** Soft-delete a discovered candidate outright (any status). */
export async function deleteDiscoveredItem(itemId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("discovered_item")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete this discovered item");
}

/** Return a dismissed candidate to the pending queue. */
export async function undismissDiscoveredItem(itemId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("discovered_item")
    .update({ status: "pending", reviewed_at: null, reviewed_by: null })
    .eq("id", itemId)
    .eq("status", "dismissed")
    .select("id");
  assertMutated(response.data, response.error, "restore this discovered item");
}

// ============================================================================
// Properties — full CRUD (socials and other brand presences)
// ============================================================================

export async function createProperty(
  input: CreatePropertyInput,
): Promise<BrandProperty> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("property")
    .insert({
      organization_id: input.organizationId,
      brand_id: input.brandId,
      kind: input.kind,
      url: input.url,
      handle: input.handle,
      display_name: input.displayName,
      status: input.status,
    })
    .select(PROPERTY_COLUMNS)
    .single();
  return assertData(response.data, response.error);
}

export async function updateProperty(
  input: UpdatePropertyInput,
): Promise<BrandProperty> {
  const db = await authenticatedWebDb(supabase);
  return guardedUpdateOrThrow<BrandProperty>({
    expectedVersion: input.expectedVersion,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("property")
        .update({ ...input.patch, version: nextVersion })
        .eq("id", input.propertyId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(PROPERTY_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("property")
        .select(PROPERTY_COLUMNS)
        .eq("id", input.propertyId)
        .is("deleted_at", null)
        .maybeSingle(),
    conflictMessage:
      "This property changed in another session. Reload and try again.",
  });
}

export async function deleteProperty(propertyId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("property")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", propertyId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete this property");
}

// ============================================================================
// Brand assets — full CRUD (manual create by URL; promotion lives above)
// ============================================================================

export async function createBrandAsset(
  input: CreateBrandAssetInput,
): Promise<BrandAsset> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("brand_asset")
    .insert({
      organization_id: input.organizationId,
      brand_id: input.brandId,
      kind: input.kind,
      source_url: input.sourceUrl,
      file_id: input.fileId ?? null,
      title: input.title,
      notes: input.notes,
      is_primary: input.isPrimary,
      source: input.source ?? "manual",
      confirmed_at: new Date().toISOString(),
    })
    .select(BRAND_ASSET_COLUMNS)
    .single();
  return assertData(response.data, response.error);
}

export async function updateBrandAsset(
  input: UpdateBrandAssetInput,
): Promise<BrandAsset> {
  const db = await authenticatedWebDb(supabase);
  return guardedUpdateOrThrow<BrandAsset>({
    expectedVersion: input.expectedVersion,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("brand_asset")
        .update({ ...input.patch, version: nextVersion })
        .eq("id", input.assetId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(BRAND_ASSET_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("brand_asset")
        .select(BRAND_ASSET_COLUMNS)
        .eq("id", input.assetId)
        .is("deleted_at", null)
        .maybeSingle(),
    conflictMessage:
      "This asset changed in another session. Reload and try again.",
  });
}

export async function deleteBrandAsset(assetId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("brand_asset")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", assetId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete this asset");
}

// ============================================================================
// Business facts — full CRUD (manual create; promotion lives above)
// ============================================================================

function factValuePayload(value: string): { [key: string]: string } {
  return /^https?:\/\//i.test(value.trim())
    ? { url: value.trim() }
    : { text: value.trim() };
}

export async function createBusinessFact(
  input: CreateBusinessFactInput,
): Promise<BusinessFact> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("business_fact")
    .insert({
      organization_id: input.organizationId,
      brand_id: input.brandId,
      kind: input.kind,
      label: input.label,
      value: factValuePayload(input.value),
      source: "manual",
      confirmed_at: new Date().toISOString(),
    })
    .select(BUSINESS_FACT_COLUMNS)
    .single();
  return assertData(response.data, response.error);
}

export async function updateBusinessFact(
  input: UpdateBusinessFactInput,
): Promise<BusinessFact> {
  const db = await authenticatedWebDb(supabase);
  return guardedUpdateOrThrow<BusinessFact>({
    expectedVersion: input.expectedVersion,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("business_fact")
        .update({
          kind: input.kind,
          label: input.label,
          value: factValuePayload(input.value),
          version: nextVersion,
        })
        .eq("id", input.factId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(BUSINESS_FACT_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("business_fact")
        .select(BUSINESS_FACT_COLUMNS)
        .eq("id", input.factId)
        .is("deleted_at", null)
        .maybeSingle(),
    conflictMessage:
      "This fact changed in another session. Reload and try again.",
  });
}

export async function deleteBusinessFact(factId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("business_fact")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", factId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete this fact");
}

// ============================================================================
// Screenshots + crawl sessions — soft-delete of stored evidence records
// ============================================================================

/** Soft-delete a stored screenshot (the canonical file record remains). */
export async function deleteScreenshot(
  siteId: string,
  screenshotId: string,
): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("screenshot")
    .update({ deleted_at: new Date().toISOString() })
    .eq("site_id", siteId)
    .eq("id", screenshotId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete this capture");
}

/** Soft-delete a crawl session (its URL ledger and events stay attached). */
export async function deleteCrawlSession(
  siteId: string,
  crawlId: string,
): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("crawl_session")
    .update({ deleted_at: new Date().toISOString() })
    .eq("site_id", siteId)
    .eq("id", crawlId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete this crawl session");
}

// ---------------------------------------------------------------------------
// Site audit rollup + score trend — aggregated IN POSTGRES.
//
// These were client-side: every `web.page` row for the site plus every latest
// snapshot's full `seo_metrics` / `audit_metrics` jsonb came over the wire and
// was grouped in JS, behind a hard 5,000-page ceiling that THREW rather than
// truncating. allgreenrecycling.com's 4,531 live pages were ~6.9 MB of JSON and
// 469 crawled rows away from a blank audit page.
//
// Both are now one RPC each — `web.site_audit_rollup` / `web.site_audit_trend`
// (migration `web_site_audit_rollup_server_side.sql`), SECURITY INVOKER so RLS
// stays the ceiling. There is NO row cap on either path: the aggregate covers
// every page the caller can see, and the rollup states that coverage itself
// (totalPages / auditedPages / uncomputedPages / nonHtmlResources).
//
// The pure TS twins in `lib/audit-rollup.ts` remain the jest-tested
// specification of the counting semantics — change one, change both.
// ---------------------------------------------------------------------------

export async function fetchSiteAuditRollup(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteAuditRollup> {
  const response = await (await authenticatedWebDb(supabase))
    .rpc("site_audit_rollup", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  return parseSiteAuditRollup(assertData(response.data, response.error));
}

export async function fetchSiteAuditTrend(
  siteId: string,
  signal?: AbortSignal,
): Promise<AuditTrendPoint[]> {
  const response = await (await authenticatedWebDb(supabase))
    .rpc("site_audit_trend", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  return parseSiteAuditTrend(assertData(response.data, response.error));
}

// ---------------------------------------------------------------------------
// Site media inventory — every canonical page's latest snapshot reduced to its
// media evidence (`images` + `head_tags` ONLY — never full snapshot rows).
// Aggregation/dedupe is pure (lib/snapshot-media.ts); this only pages the
// rows out of Supabase.
// ---------------------------------------------------------------------------

const MEDIA_PAGE_CAP = 5000;
const MEDIA_PAGE_SIZE = 1000;
/**
 * Supabase/PostgREST serializes `.in()` filters into the GET URL. Keep UUID
 * batches comfortably below the edge request-line ceiling; this is a request
 * size bound, deliberately separate from the 1,000-row response page size.
 */
const MEDIA_SNAPSHOT_ID_BATCH_SIZE = 150;

export async function fetchSiteMediaRows(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteMediaPageRow[]> {
  const db = await authenticatedWebDb(supabase);
  const pages: {
    id: string;
    url: string;
    path: string | null;
    latest_snapshot_id: string | null;
  }[] = [];
  for (let offset = 0; ; offset += MEDIA_PAGE_SIZE) {
    if (offset >= MEDIA_PAGE_CAP) {
      throw new Error(
        `Site media inventory exceeded its ${MEDIA_PAGE_CAP}-page bound — refusing to return a silently truncated inventory.`,
      );
    }
    const response = await db
      .from("page")
      .select("id, url, path, latest_snapshot_id")
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .not("latest_snapshot_id", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + MEDIA_PAGE_SIZE - 1)
      .abortSignal(signal ?? new AbortController().signal);
    const batch = assertData(response.data, response.error);
    pages.push(...batch);
    if (batch.length < MEDIA_PAGE_SIZE) break;
  }

  const snapshotIds = pages.flatMap((page) =>
    page.latest_snapshot_id ? [page.latest_snapshot_id] : [],
  );
  const mediaBySnapshot = new Map<
    string,
    { images: Json; head_tags: Json; captured_at: string }
  >();
  for (
    let start = 0;
    start < snapshotIds.length;
    start += MEDIA_SNAPSHOT_ID_BATCH_SIZE
  ) {
    const chunk = snapshotIds.slice(
      start,
      start + MEDIA_SNAPSHOT_ID_BATCH_SIZE,
    );
    const response = await db
      .from("snapshot")
      .select("id, images, head_tags, captured_at")
      .eq("site_id", siteId)
      .in("id", chunk)
      .abortSignal(signal ?? new AbortController().signal);
    for (const snapshot of assertData(response.data, response.error)) {
      mediaBySnapshot.set(snapshot.id, {
        images: snapshot.images,
        head_tags: snapshot.head_tags,
        captured_at: snapshot.captured_at,
      });
    }
  }

  const rows: SiteMediaPageRow[] = [];
  for (const page of pages) {
    const media = page.latest_snapshot_id
      ? mediaBySnapshot.get(page.latest_snapshot_id)
      : undefined;
    if (!media) continue;
    const headTags = parseSnapshotHeadTags(media.head_tags);
    rows.push({
      pageId: page.id,
      url: page.url,
      path: page.path,
      capturedAt: media.captured_at,
      images: parseSnapshotImages(media.images),
      ogImage: headTags.og.image,
      twitterImage: headTags.twitter.image,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Site video evidence — every canonical page's latest snapshot reduced to its
// DOM resource inventory (`extracted->resources` JSON sub-path ONLY — never
// the full `extracted` blob). Aggregation/dedupe is pure
// (lib/snapshot-video.ts); this only pages the rows out of Supabase.
// ---------------------------------------------------------------------------

// Typed `string` (not a literal) because the postgrest-js select parser blows
// TS2589 on the JSON arrow path; the result shape is pinned by `.returns<…>()`
// below (same pattern as inspection-queries.ts).
const VIDEO_RESOURCES_SELECT: string =
  "id, captured_at, resources:extracted->resources";

export async function fetchSiteVideoResourceRows(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteVideoResourceRow[]> {
  const db = await authenticatedWebDb(supabase);
  const pages: {
    id: string;
    url: string;
    path: string | null;
    latest_snapshot_id: string | null;
  }[] = [];
  for (let offset = 0; ; offset += MEDIA_PAGE_SIZE) {
    if (offset >= MEDIA_PAGE_CAP) {
      throw new Error(
        `Site video inventory exceeded its ${MEDIA_PAGE_CAP}-page bound — refusing to return a silently truncated inventory.`,
      );
    }
    const response = await db
      .from("page")
      .select("id, url, path, latest_snapshot_id")
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .not("latest_snapshot_id", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + MEDIA_PAGE_SIZE - 1)
      .abortSignal(signal ?? new AbortController().signal);
    const batch = assertData(response.data, response.error);
    pages.push(...batch);
    if (batch.length < MEDIA_PAGE_SIZE) break;
  }

  const snapshotIds = pages.flatMap((page) =>
    page.latest_snapshot_id ? [page.latest_snapshot_id] : [],
  );
  const resourcesBySnapshot = new Map<
    string,
    { resources: Json; captured_at: string }
  >();
  for (
    let start = 0;
    start < snapshotIds.length;
    start += MEDIA_SNAPSHOT_ID_BATCH_SIZE
  ) {
    const chunk = snapshotIds.slice(
      start,
      start + MEDIA_SNAPSHOT_ID_BATCH_SIZE,
    );
    const response = await db
      .from("snapshot")
      .select(VIDEO_RESOURCES_SELECT)
      .eq("site_id", siteId)
      .in("id", chunk)
      .abortSignal(signal ?? new AbortController().signal)
      .returns<{ id: string; captured_at: string; resources: Json }[]>();
    for (const snapshot of assertData(response.data, response.error)) {
      resourcesBySnapshot.set(snapshot.id, {
        resources: snapshot.resources,
        captured_at: snapshot.captured_at,
      });
    }
  }

  const rows: SiteVideoResourceRow[] = [];
  for (const page of pages) {
    const entry = page.latest_snapshot_id
      ? resourcesBySnapshot.get(page.latest_snapshot_id)
      : undefined;
    if (!entry) continue;
    // parseSnapshotResources reads `extracted.resources` — re-wrap the
    // projected sub-path so the ONE parser stays the single entry point.
    const parsed = parseSnapshotResources({ resources: entry.resources });
    if (parsed.items.length === 0) continue;
    rows.push({
      pageId: page.id,
      url: page.url,
      path: page.path,
      capturedAt: entry.captured_at,
      resources: parsed.items,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Site structure (routing tree) — bounded fetch of every canonical page's
// identity fields from the v_page_list projection. Tree assembly is pure
// (lib/route-tree.ts); this only pages the rows out of Supabase.
// ---------------------------------------------------------------------------

const STRUCTURE_PAGE_CAP = 20000;
const STRUCTURE_PAGE_SIZE = 1000;

export async function fetchSiteStructureRows(
  siteId: string,
  signal?: AbortSignal,
): Promise<StructurePageRow[]> {
  const db = await authenticatedWebDb(supabase);
  const rows: StructurePageRow[] = [];
  for (let offset = 0; ; offset += STRUCTURE_PAGE_SIZE) {
    if (offset >= STRUCTURE_PAGE_CAP) {
      throw new Error(
        `Site structure exceeded its ${STRUCTURE_PAGE_CAP}-page bound — refusing to render a silently truncated tree.`,
      );
    }
    const response = await db
      .from("v_page_list")
      .select(
        "page_id, url, path, observed_title, http_status_last, sitemap_count",
      )
      .eq("site_id", siteId)
      .order("page_id", { ascending: true })
      .range(offset, offset + STRUCTURE_PAGE_SIZE - 1)
      .abortSignal(signal ?? new AbortController().signal);
    const batch = assertData(response.data, response.error);
    for (const row of batch) {
      if (!row.page_id || !row.url) continue;
      rows.push({
        pageId: row.page_id,
        url: row.url,
        path: row.path,
        title: row.observed_title,
        httpStatus: row.http_status_last,
        inSitemap: (row.sitemap_count ?? 0) > 0,
      });
    }
    if (batch.length < STRUCTURE_PAGE_SIZE) break;
  }
  return rows;
}
