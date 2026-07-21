import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import { buildStoredSeoMetrics } from "@/features/seo/serp/metrics";
import type {
  BrandAsset,
  BrandListRow,
  BrandProperty,
  BusinessFact,
  ConfirmAssetInput,
  ConfirmFactInput,
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
  PageListRow,
  PageSnapshot,
  PageUpdate,
  PageWorkspaceData,
  PagedResult,
  PageSitemapMembershipRow,
  SitemapCoverage,
  SitemapPageRow,
  SiteSitemap,
  SiteListRow,
  SiteOverviewMetrics,
  SiteScreenshot,
  UpdateBrandAssetInput,
  UpdateBrandInput,
  UpdateBusinessFactInput,
  UpdatePageIntentInput,
  UpdatePropertyInput,
  UpdateSiteIdentityInput,
} from "@/features/marketing/types";
import { isJsonRecord } from "@/features/marketing/types";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import {
  normalisePageUrl,
  pagePathOf,
  pageUrlHash,
} from "@/features/marketing/lib/page-url";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";

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

function textFilter(
  state: MatrxDataTableQueryState,
  column: string,
): string | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "text" && filter.value.trim()
    ? cleanSearch(filter.value)
    : null;
}

function visibilityFilter(
  state: MatrxDataTableQueryState,
): MarketingSite["visibility"] | null {
  const value = selectFilter(state, "visibility");
  return value === "private" ||
    value === "internal" ||
    value === "link" ||
    value === "public"
    ? value
    : null;
}

function assertData<T>(data: T | null, error: unknown): T {
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
 */
export function assertFound<T>(
  data: T | null,
  error: unknown,
  entity: string,
): T {
  if (error) throw error;
  if (data === null) {
    throw new Error(`This ${entity} was deleted or is no longer accessible.`);
  }
  return data;
}

/** Every `web.site` column — ONE list so selects can never drift per call site. */
export const SITE_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, name, root_url, domain, status, visibility, integrations, homepage_screenshot_id, settings, brand_id, description, favicon_url, logo_url, og_image_url, initialized_at, initialization, gsc_synced_at, gsc_sync";

export async function listSites(
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<PagedResult<SiteListRow>> {
  const db = await authenticatedWebDb(supabase);
  const { from, to } = rangeFor(state);
  const sortColumns = {
    name: "name",
    domain: "domain",
    status: "status",
    visibility: "visibility",
    updated_at: "updated_at",
    created_at: "created_at",
  } as const;
  const requestedSort = state.sort?.id ?? "updated_at";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "updated_at";
  const ascending = state.sort?.direction === "asc";

  let query = db
    .from("site")
    .select(
      SITE_COLUMNS,
      { count: "exact" },
    )
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

  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  const sites = assertData(response.data, response.error);

  if (sites.length === 0) return { rows: [], total: response.count ?? 0 };
  const scoreResponse = await db
    .from("v_site_score")
    .select("site_id, site_score, scored_pages")
    .in(
      "site_id",
      sites.map((site) => site.id),
    )
    .abortSignal(signal ?? new AbortController().signal);
  const scores = assertData(scoreResponse.data, scoreResponse.error);
  const bySite = new Map(scores.map((score) => [score.site_id, score]));

  return {
    rows: sites.map((site) => {
      const score = bySite.get(site.id);
      return {
        ...site,
        health_score: score?.site_score ?? null,
        scored_pages: Number(score?.scored_pages ?? 0),
      };
    }),
    total: response.count ?? 0,
  };
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
      .select(
        SITE_COLUMNS,
      )
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
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("site")
    .select(
      SITE_COLUMNS,
    )
    .eq("id", siteId)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  return assertFound(response.data, response.error, "site");
}

export async function getSiteOverview(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteOverviewMetrics> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const [score, pages, findings, snapshots, latestCrawl] = await Promise.all([
    db
      .from("v_site_score")
      .select("site_id, site_score, scored_pages")
      .eq("site_id", siteId)
      .abortSignal(abortSignal)
      .maybeSingle(),
    db
      .from("page")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("deleted_at", null)
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
  ]);

  if (score.error) throw score.error;
  if (pages.error) throw pages.error;
  if (findings.error) throw findings.error;
  if (snapshots.error) throw snapshots.error;
  if (latestCrawl.error) throw latestCrawl.error;

  return {
    siteScore: score.data?.site_score ?? null,
    scoredPages: Number(score.data?.scored_pages ?? 0),
    canonicalPages: pages.count ?? 0,
    openFindings: findings.count ?? 0,
    snapshots: snapshots.count ?? 0,
    latestCrawl: latestCrawl.data,
  };
}

/** Read observed homepage `<title>` and meta description from the latest snapshot. */
export async function getHomepageObservedMeta(
  siteId: string,
  signal?: AbortSignal,
): Promise<HomepageObservedMeta | null> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const pageResponse = await db
    .from("page")
    .select("id, latest_snapshot_id")
    .eq("site_id", siteId)
    .eq("path", "/")
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
    p_visibility: "private",
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
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, url, url_hash, path, provenance, status, first_seen, last_seen, http_status_last, target_keyword, meta_title_desired, meta_description_desired, seo_metrics_desired, latest_snapshot_id";

/** Every `web.snapshot` column — ONE list so selects can never drift per call site. */
export const SNAPSHOT_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, page_id, session_id, captured_at, final_url, http_status, content_hash, word_count, body_file_id, markdown_file_id, head_tags, headings, links_summary, images, structured_data, perf, extracted, seo_metrics";

/**
 * Source-disagreement coverage filters over the canonical page registry.
 * Membership = a live `web.page_sitemap` row; crawled = `latest_snapshot_id`.
 */
export type PageCoverageFilter =
  | "in_sitemap"
  | "crawled"
  | "never_crawled"
  | "sitemap_not_crawled"
  | "crawled_no_sitemap"
  | "in_gsc"
  | "gsc_no_sitemap"
  | "sitemap_no_gsc";

export const PAGE_COVERAGE_FILTERS: readonly PageCoverageFilter[] = [
  "in_sitemap",
  "crawled",
  "never_crawled",
  "sitemap_not_crawled",
  "crawled_no_sitemap",
  "in_gsc",
  "gsc_no_sitemap",
  "sitemap_no_gsc",
];

export function isPageCoverageFilter(
  value: string | null,
): value is PageCoverageFilter {
  return (
    value !== null &&
    (PAGE_COVERAGE_FILTERS as readonly string[]).includes(value)
  );
}

export async function listPages(
  siteId: string,
  state: MatrxDataTableQueryState,
  coverage: PageCoverageFilter | null = null,
  signal?: AbortSignal,
): Promise<PagedResult<PageListRow>> {
  const db = await authenticatedWebDb(supabase);
  const { from, to } = rangeFor(state);
  const sortColumns = {
    url: "url",
    path: "path",
    status: "status",
    provenance: "provenance",
    http_status_last: "http_status_last",
    target_keyword: "target_keyword",
    first_seen: "first_seen",
    last_seen: "last_seen",
  } as const;
  const requestedSort = state.sort?.id ?? "last_seen";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "last_seen";
  const ascending = state.sort?.direction === "asc";

  // The left-joined embeds power the coverage filters and the per-row
  // "in N sitemaps" signal; soft-deleted evidence never counts. The GSC embed
  // is a presence probe only — its returned rows are capped at 1 below, and
  // the top-level `is null` / `not is null` semi-join filters are unaffected
  // by that cap.
  let query = db
    .from("page")
    .select(`${PAGE_COLUMNS}, page_sitemap!left(id), gsc_page_stat!left(id)`, {
      count: "exact",
    })
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .is("page_sitemap.deleted_at", null)
    .is("gsc_page_stat.deleted_at", null)
    .limit(1, { referencedTable: "gsc_page_stat" });

  if (coverage === "in_sitemap") {
    query = query.not("page_sitemap", "is", null);
  } else if (coverage === "crawled") {
    query = query.not("latest_snapshot_id", "is", null);
  } else if (coverage === "never_crawled") {
    query = query.is("latest_snapshot_id", null);
  } else if (coverage === "sitemap_not_crawled") {
    query = query
      .not("page_sitemap", "is", null)
      .is("latest_snapshot_id", null);
  } else if (coverage === "crawled_no_sitemap") {
    query = query
      .is("page_sitemap", null)
      .not("latest_snapshot_id", "is", null);
  } else if (coverage === "in_gsc") {
    query = query.not("gsc_page_stat", "is", null);
  } else if (coverage === "gsc_no_sitemap") {
    query = query
      .not("gsc_page_stat", "is", null)
      .is("page_sitemap", null);
  } else if (coverage === "sitemap_no_gsc") {
    query = query
      .not("page_sitemap", "is", null)
      .is("gsc_page_stat", null);
  }

  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `url.ilike.%${search}%,path.ilike.%${search}%,target_keyword.ilike.%${search}%`,
    );
  }
  const url = textFilter(state, "url");
  const path = textFilter(state, "path");
  const keyword = textFilter(state, "target_keyword");
  const status = selectFilter(state, "status");
  const provenance = selectFilter(state, "provenance");
  const http = numberFilter(state, "http_status_last");
  if (url) query = query.ilike("url", `%${url}%`);
  if (path) query = query.ilike("path", `%${path}%`);
  if (keyword) query = query.ilike("target_keyword", `%${keyword}%`);
  if (status) query = query.eq("status", status);
  if (provenance) query = query.eq("provenance", provenance);
  if (http?.min !== undefined) query = query.gte("http_status_last", http.min);
  if (http?.max !== undefined) query = query.lte("http_status_last", http.max);

  query = query.order(sortColumn, { ascending, nullsFirst: false });
  query = query.order("id", { ascending });
  const response = await query
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);
  const pages = assertData(response.data, response.error);
  if (pages.length === 0) return { rows: [], total: response.count ?? 0 };

  // Batched observed-content enrichment: one snapshot read for the whole page.
  const snapshotIds = pages.flatMap((page) =>
    page.latest_snapshot_id ? [page.latest_snapshot_id] : [],
  );
  const bySnapshot = new Map<
    string,
    { title: string | null; wordCount: number | null }
  >();
  if (snapshotIds.length > 0) {
    const snapshotResponse = await db
      .from("snapshot")
      .select("id, head_tags, word_count")
      .eq("site_id", siteId)
      .in("id", snapshotIds)
      .abortSignal(signal ?? new AbortController().signal);
    const snapshots = assertData(snapshotResponse.data, snapshotResponse.error);
    for (const snapshot of snapshots) {
      bySnapshot.set(snapshot.id, {
        title: parseSnapshotHeadTags(snapshot.head_tags).title,
        wordCount: snapshot.word_count,
      });
    }
  }

  // Batched 28-day GSC rollup: paginate past PostgREST's row cap so sums are
  // never silently truncated; (page_id, date) is unique, so the ordering is
  // deterministic across pages.
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const gscByPage = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      positionWeight: number;
      weightSum: number;
    }
  >();
  const pageIds = pages.map((page) => page.id);
  for (let offset = 0; ; offset += 1000) {
    if (offset >= 20000) {
      throw new Error(
        "GSC stat enrichment exceeded its expected row bound — aborting instead of returning truncated sums.",
      );
    }
    const statResponse = await db
      .from("gsc_page_stat")
      .select("page_id, clicks, impressions, position")
      .eq("site_id", siteId)
      .in("page_id", pageIds)
      .gte("date", since)
      .is("deleted_at", null)
      .order("page_id", { ascending: true })
      .order("date", { ascending: true })
      .range(offset, offset + 999)
      .abortSignal(signal ?? new AbortController().signal);
    const stats = assertData(statResponse.data, statResponse.error);
    for (const stat of stats) {
      const bucket = gscByPage.get(stat.page_id) ?? {
        clicks: 0,
        impressions: 0,
        positionWeight: 0,
        weightSum: 0,
      };
      bucket.clicks += stat.clicks;
      bucket.impressions += stat.impressions;
      if (stat.position !== null) {
        const weight = Math.max(stat.impressions, 1);
        bucket.positionWeight += stat.position * weight;
        bucket.weightSum += weight;
      }
      gscByPage.set(stat.page_id, bucket);
    }
    if (stats.length < 1000) break;
  }

  return {
    rows: pages.map(({ page_sitemap, gsc_page_stat, ...page }) => {
      const observed = page.latest_snapshot_id
        ? bySnapshot.get(page.latest_snapshot_id)
        : undefined;
      const gsc = gscByPage.get(page.id);
      return {
        ...page,
        sitemap_count: page_sitemap.length,
        in_gsc: gsc_page_stat.length > 0,
        observed_title: observed?.title ?? null,
        word_count: observed?.wordCount ?? null,
        gsc_clicks_28d: gsc ? gsc.clicks : null,
        gsc_impressions_28d: gsc ? gsc.impressions : null,
        gsc_position_28d:
          gsc && gsc.weightSum > 0 ? gsc.positionWeight / gsc.weightSum : null,
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
  totalPages: number;
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

  const basePages = () =>
    db
      .from("page")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("deleted_at", null);
  const membershipPages = () =>
    db
      .from("page")
      .select("id, page_sitemap!inner(id)", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .is("page_sitemap.deleted_at", null);
  const antiMembershipPages = () =>
    db
      .from("page")
      .select("id, page_sitemap!left(id)", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .is("page_sitemap.deleted_at", null)
      .is("page_sitemap", null);

  const gscPages = () =>
    db
      .from("page")
      .select("id, gsc_page_stat!inner(id)", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .is("gsc_page_stat.deleted_at", null);

  const [
    total,
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
    basePages().abortSignal(abortSignal),
    membershipPages().abortSignal(abortSignal),
    basePages().not("latest_snapshot_id", "is", null).abortSignal(abortSignal),
    basePages().is("latest_snapshot_id", null).abortSignal(abortSignal),
    membershipPages().is("latest_snapshot_id", null).abortSignal(abortSignal),
    antiMembershipPages()
      .not("latest_snapshot_id", "is", null)
      .abortSignal(abortSignal),
    gscPages().abortSignal(abortSignal),
    db
      .from("page")
      .select("id, gsc_page_stat!inner(id), page_sitemap!left(id)", {
        count: "exact",
        head: true,
      })
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .is("gsc_page_stat.deleted_at", null)
      .is("page_sitemap.deleted_at", null)
      .is("page_sitemap", null)
      .abortSignal(abortSignal),
    db
      .from("page")
      .select("id, page_sitemap!inner(id), gsc_page_stat!left(id)", {
        count: "exact",
        head: true,
      })
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .is("page_sitemap.deleted_at", null)
      .is("gsc_page_stat.deleted_at", null)
      .is("gsc_page_stat", null)
      .abortSignal(abortSignal),
    ...PAGE_PROVENANCES.map((provenance) =>
      basePages().eq("provenance", provenance).abortSignal(abortSignal),
    ),
  ]);

  for (const response of [
    total,
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
    .select(
      PAGE_COLUMNS,
    )
    .eq("site_id", siteId)
    .eq("id", pageId)
    .is("deleted_at", null)
    .abortSignal(abortSignal)
    .maybeSingle();
  const page = assertFound(pageResponse.data, pageResponse.error, "page");

  const [snapshotResponse, scoreResponse, findingsResponse] = await Promise.all(
    [
      page.latest_snapshot_id
        ? db
            .from("snapshot")
            .select(
              SNAPSHOT_COLUMNS,
            )
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
    ],
  );
  if (snapshotResponse.error) throw snapshotResponse.error;
  if (scoreResponse.error) throw scoreResponse.error;
  if (findingsResponse.error) throw findingsResponse.error;

  return {
    page,
    latestSnapshot: snapshotResponse.data,
    score: scoreResponse.data?.page_score ?? null,
    failCount: Number(scoreResponse.data?.fail_count ?? 0),
    openFindings: findingsResponse.count ?? 0,
  };
}

export async function updatePageIntent(
  input: UpdatePageIntentInput,
): Promise<MarketingPage> {
  // Desired-metadata metrics are recomputed on EVERY intent save (contract in
  // migrations/web_seo_metrics.sql) — the deterministic evaluator matches the
  // scraper's crawl-time computation exactly, so stored numbers never depend
  // on who wrote them.
  const hasDesired = Boolean(input.desiredMetaTitle || input.desiredMetaDescription);
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
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("page")
    .update(patch)
    .eq("site_id", input.siteId)
    .eq("id", input.pageId)
    .eq("version", input.expectedVersion)
    .is("deleted_at", null)
    .select(
      PAGE_COLUMNS,
    )
    .maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) {
    throw new Error(
      "This page changed in another session. Reload and try again.",
    );
  }
  return response.data;
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
    .select(
      SNAPSHOT_COLUMNS,
      { count: "exact" },
    )
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
    .select(
      SNAPSHOT_COLUMNS,
    )
    .eq("site_id", siteId)
    .eq("page_id", pageId)
    .eq("id", snapshotId)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  return assertFound(response.data, response.error, "snapshot");
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
  return assertFound(response.data, response.error, "crawl session");
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
  const outcome = selectFilter(state, "outcome");
  const classification = selectFilter(state, "classification");
  const source = selectFilter(state, "discovery_source");
  const sequence = numberFilter(state, "sequence");
  const depth = numberFilter(state, "depth");
  const http = numberFilter(state, "http_status");
  if (rawUrl) query = query.ilike("raw_url", `%${rawUrl}%`);
  if (outcome) query = query.eq("outcome", outcome);
  if (classification) query = query.eq("classification", classification);
  if (source) query = query.eq("discovery_source", source);
  if (sequence?.min !== undefined) query = query.gte("sequence", sequence.min);
  if (sequence?.max !== undefined) query = query.lte("sequence", sequence.max);
  if (depth?.min !== undefined) query = query.gte("depth", depth.min);
  if (depth?.max !== undefined) query = query.lte("depth", depth.max);
  if (http?.min !== undefined) query = query.gte("http_status", http.min);
  if (http?.max !== undefined) query = query.lte("http_status", http.max);
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
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("site")
    .update(input.patch)
    .eq("id", input.siteId)
    .eq("version", input.expectedVersion)
    .is("deleted_at", null)
    .select(SITE_COLUMNS)
    .maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) {
    throw new Error(
      "This site changed in another session. Reload and try again.",
    );
  }
  return response.data;
}

const SCREENSHOT_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, page_id, snapshot_id, kind, width, height, captured_at, file_id";

/**
 * Latest display screenshot for the site hero. Prefers the above-the-fold
 * desktop capture; falls back to any capture so pre-initialization sites
 * with older data still render something real.
 */
export async function getSiteHeroScreenshot(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteScreenshot | null> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const preferred = await db
    .from("screenshot")
    .select(SCREENSHOT_COLUMNS)
    .eq("site_id", siteId)
    .in("kind", ["desktop_fold", "homepage", "viewport"])
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .abortSignal(abortSignal)
    .maybeSingle();
  if (preferred.error) throw preferred.error;
  if (preferred.data) return preferred.data;

  const any = await db
    .from("screenshot")
    .select(SCREENSHOT_COLUMNS)
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .abortSignal(abortSignal)
    .maybeSingle();
  if (any.error) throw any.error;
  return any.data;
}

const DISCOVERED_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, brand_id, site_id, snapshot_id, source, category, guessed_kind, url, value, value_hash, context, confidence, status, resolved_asset_id, resolved_fact_id, reviewed_by, reviewed_at";

/** Discovery inbox for a brand, optionally narrowed by status. Bounded. */
export async function listDiscoveredItems(
  brandId: string,
  status: DiscoveredItemStatus | null,
  signal?: AbortSignal,
): Promise<DiscoveredItem[]> {
  const db = await authenticatedWebDb(supabase);
  let query = db
    .from("discovered_item")
    .select(DISCOVERED_COLUMNS)
    .eq("brand_id", brandId)
    .is("deleted_at", null);
  if (status) query = query.eq("status", status);
  const response = await query
    .order("category", { ascending: true })
    .order("confidence", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(500)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
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
      value: input.item.url ? { url: input.item.url, ...asRecord(input.item.value) } : input.item.value,
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
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, name, description, website_url, logo_url, favicon_url, og_image_url, industry, notes, status, visibility, settings";

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
  const [sitesResponse, pendingResponse, propertiesResponse, assetsResponse, factsResponse] = await Promise.all([
    db
      .from("site")
      .select("id, brand_id, name, domain, favicon_url, logo_url, initialized_at")
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
    pendingByBrand.set(item.brand_id, (pendingByBrand.get(item.brand_id) ?? 0) + 1);
  }
  const countBy = (rowsWithBrand: Array<{ brand_id: string }>) => {
    const map = new Map<string, number>();
    for (const row of rowsWithBrand) {
      map.set(row.brand_id, (map.get(row.brand_id) ?? 0) + 1);
    }
    return map;
  };
  const socialsByBrand = countBy(assertData(propertiesResponse.data, propertiesResponse.error));
  const assetsByBrand = countBy(assertData(assetsResponse.data, assetsResponse.error));
  const factsByBrand = countBy(assertData(factsResponse.data, factsResponse.error));

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
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("brand")
    .select(BRAND_COLUMNS)
    .eq("id", brandId)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  return assertFound(response.data, response.error, "brand");
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
  return assertFound(response.data, response.error, "sitemap");
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

export async function createBrand(input: CreateBrandInput): Promise<MarketingBrand> {
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
      visibility: input.visibility,
    })
    .select(BRAND_COLUMNS)
    .single();
  return assertData(response.data, response.error);
}

export async function updateBrand(input: UpdateBrandInput): Promise<MarketingBrand> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("brand")
    .update(input.patch)
    .eq("id", input.brandId)
    .eq("version", input.expectedVersion)
    .is("deleted_at", null)
    .select(BRAND_COLUMNS)
    .maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) {
    throw new Error("This brand changed in another session. Reload and try again.");
  }
  return response.data;
}

/**
 * Soft-delete a brand. Refuses while live sites still point at it — deleting
 * the anchor out from under its properties would orphan them silently.
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
  const response = await db
    .from("brand")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", brandId)
    .is("deleted_at", null);
  if (response.error) throw response.error;
}

/** Soft-delete a site (its crawl history stays; the row leaves every list). */
export async function deleteSite(siteId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("site")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", siteId)
    .is("deleted_at", null);
  if (response.error) throw response.error;
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
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("page")
    .insert({
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

/** Soft-delete a canonical page (its snapshots and evidence stay). */
export async function deletePage(
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
    .is("deleted_at", null);
  if (response.error) throw response.error;
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
    .is("deleted_at", null);
  if (response.error) throw response.error;
}

/**
 * Soft-delete a sitemap document AND its membership evidence — orphaned
 * `page_sitemap` rows would keep counting pages as "in a sitemap" that no
 * longer exists. A future sync that re-discovers the document re-creates both.
 */
export async function deleteSitemap(
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
    .is("deleted_at", null);
  if (response.error) throw response.error;
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
    .is("deleted_at", null);
  if (response.error) throw response.error;
}

/** Return a dismissed candidate to the pending queue. */
export async function undismissDiscoveredItem(itemId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("discovered_item")
    .update({ status: "pending", reviewed_at: null, reviewed_by: null })
    .eq("id", itemId)
    .eq("status", "dismissed");
  if (response.error) throw response.error;
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
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("property")
    .update(input.patch)
    .eq("id", input.propertyId)
    .eq("version", input.expectedVersion)
    .is("deleted_at", null)
    .select(PROPERTY_COLUMNS)
    .maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) {
    throw new Error(
      "This property changed in another session. Reload and try again.",
    );
  }
  return response.data;
}

export async function deleteProperty(propertyId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("property")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", propertyId)
    .is("deleted_at", null);
  if (response.error) throw response.error;
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
      title: input.title,
      notes: input.notes,
      is_primary: input.isPrimary,
      source: "manual",
      confirmed_at: new Date().toISOString(),
    })
    .select(BRAND_ASSET_COLUMNS)
    .single();
  return assertData(response.data, response.error);
}

export async function updateBrandAsset(
  input: UpdateBrandAssetInput,
): Promise<BrandAsset> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("brand_asset")
    .update(input.patch)
    .eq("id", input.assetId)
    .eq("version", input.expectedVersion)
    .is("deleted_at", null)
    .select(BRAND_ASSET_COLUMNS)
    .maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) {
    throw new Error(
      "This asset changed in another session. Reload and try again.",
    );
  }
  return response.data;
}

export async function deleteBrandAsset(assetId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("brand_asset")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", assetId)
    .is("deleted_at", null);
  if (response.error) throw response.error;
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
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("business_fact")
    .update({
      kind: input.kind,
      label: input.label,
      value: factValuePayload(input.value),
    })
    .eq("id", input.factId)
    .eq("version", input.expectedVersion)
    .is("deleted_at", null)
    .select(BUSINESS_FACT_COLUMNS)
    .maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) {
    throw new Error(
      "This fact changed in another session. Reload and try again.",
    );
  }
  return response.data;
}

export async function deleteBusinessFact(factId: string): Promise<void> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("business_fact")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", factId)
    .is("deleted_at", null);
  if (response.error) throw response.error;
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
    .is("deleted_at", null);
  if (response.error) throw response.error;
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
    .is("deleted_at", null);
  if (response.error) throw response.error;
}
