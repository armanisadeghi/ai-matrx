import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
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
  CreateSiteInput,
  DiscoveredItem,
  DiscoveredItemStatus,
  HomepageObservedMeta,
  MarketingBrand,
  MarketingPage,
  MarketingSite,
  PageListRow,
  PageSnapshot,
  PageUpdate,
  PageWorkspaceData,
  PagedResult,
  SiteListRow,
  SiteOverviewMetrics,
  SiteScreenshot,
  UpdatePageIntentInput,
  UpdateSiteIdentityInput,
} from "@/features/marketing/types";
import { isJsonRecord } from "@/features/marketing/types";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
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

/** Every `web.site` column — ONE list so selects can never drift per call site. */
export const SITE_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, name, root_url, domain, status, visibility, integrations, homepage_screenshot_id, settings, brand_id, description, favicon_url, logo_url, og_image_url, initialized_at, initialization";

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
    .single();
  return assertData(response.data, response.error);
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
  });
  return assertData(response.data, response.error);
}

export async function listPages(
  siteId: string,
  state: MatrxDataTableQueryState,
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

  let query = db
    .from("page")
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, url, url_hash, path, provenance, status, first_seen, last_seen, http_status_last, target_keyword, meta_title_desired, meta_description_desired, latest_snapshot_id",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .is("deleted_at", null);

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

  const scoreResponse = await db
    .from("v_page_score")
    .select("site_id, page_id, page_score, fail_count")
    .eq("site_id", siteId)
    .in(
      "page_id",
      pages.map((page) => page.id),
    )
    .abortSignal(signal ?? new AbortController().signal);
  const scores = assertData(scoreResponse.data, scoreResponse.error);
  const byPage = new Map(scores.map((score) => [score.page_id, score]));

  return {
    rows: pages.map((page) => {
      const score = byPage.get(page.id);
      return {
        ...page,
        latest_score: score?.page_score ?? null,
        fail_count: Number(score?.fail_count ?? 0),
      };
    }),
    total: response.count ?? 0,
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
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, url, url_hash, path, provenance, status, first_seen, last_seen, http_status_last, target_keyword, meta_title_desired, meta_description_desired, latest_snapshot_id",
    )
    .eq("site_id", siteId)
    .eq("id", pageId)
    .is("deleted_at", null)
    .abortSignal(abortSignal)
    .single();
  const page = assertData(pageResponse.data, pageResponse.error);

  const [snapshotResponse, scoreResponse, findingsResponse] = await Promise.all(
    [
      page.latest_snapshot_id
        ? db
            .from("snapshot")
            .select(
              "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, page_id, session_id, captured_at, final_url, http_status, content_hash, word_count, body_file_id, markdown_file_id, head_tags, headings, links_summary, images, structured_data, perf, extracted",
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
  const patch: PageUpdate = {
    target_keyword: input.targetKeyword,
    meta_title_desired: input.desiredMetaTitle,
    meta_description_desired: input.desiredMetaDescription,
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
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, url, url_hash, path, provenance, status, first_seen, last_seen, http_status_last, target_keyword, meta_title_desired, meta_description_desired, latest_snapshot_id",
    )
    .single();
  return assertData(response.data, response.error);
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
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, page_id, session_id, captured_at, final_url, http_status, content_hash, word_count, body_file_id, markdown_file_id, head_tags, headings, links_summary, images, structured_data, perf, extracted",
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
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, page_id, session_id, captured_at, final_url, http_status, content_hash, word_count, body_file_id, markdown_file_id, head_tags, headings, links_summary, images, structured_data, perf, extracted",
    )
    .eq("site_id", siteId)
    .eq("page_id", pageId)
    .eq("id", snapshotId)
    .abortSignal(signal ?? new AbortController().signal)
    .single();
  return assertData(response.data, response.error);
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
    .single();
  return assertData(response.data, response.error);
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

/** All screenshots for a site's gallery, newest first, bounded. */
export async function listSiteScreenshots(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteScreenshot[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("screenshot")
    .select(SCREENSHOT_COLUMNS)
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

const DISCOVERED_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, brand_id, site_id, snapshot_id, source, category, guessed_kind, url, value, context, confidence, status, resolved_asset_id, resolved_fact_id, reviewed_by, reviewed_at";

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
  const [sitesResponse, pendingResponse] = await Promise.all([
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

  return {
    rows: brands.map((brand) => ({
      ...brand,
      sites: sitesByBrand.get(brand.id) ?? [],
      pending_discovered: pendingByBrand.get(brand.id) ?? 0,
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
    .single();
  return assertData(response.data, response.error);
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
