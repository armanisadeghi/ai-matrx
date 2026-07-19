import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import type {
  InspectionLinkRow,
  InspectionPagedResult,
  InspectionScreenshotRow,
  InspectionSnapshotRow,
} from "@/features/marketing/data/inspection-types";
import { supabase } from "@/utils/supabase/client";
import { webDb } from "@/utils/supabase/webDb";

const CRAWL_LINK_SELECT =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, snapshot_id, source_page_id, target_url, target_page_id, is_internal, rel, anchor_text, http_status, position, source_page:page!link_edge_source_page_id_fkey(url), target_page:page!link_edge_target_page_id_fkey(url), snapshot:snapshot!inner(captured_at, session_id)";

const SNAPSHOT_SELECT =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, page_id, session_id, captured_at, final_url, http_status, content_hash, word_count, body_ref, head_tags, headings, links_summary, images, structured_data, perf, extracted, page:page(url)";

const SCREENSHOT_SELECT =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, page_id, snapshot_id, kind, storage_bucket, storage_path, width, height, captured_at, page:page(url)";

/** Read the durable homepage screenshot selected by the site record. */
export async function getHomepageScreenshot(
  siteId: string,
  screenshotId: string,
  signal?: AbortSignal,
): Promise<InspectionScreenshotRow> {
  const response = await webDb(supabase)
    .from("screenshot")
    .select(SCREENSHOT_SELECT)
    .eq("id", screenshotId)
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal)
    .single();
  return assertData(response.data, response.error);
}

function rangeFor(state: MatrxDataTableQueryState) {
  const from = (state.page - 1) * state.pageSize;
  return { from, to: from + state.pageSize - 1 };
}

function cleanSearch(value: string): string {
  return value.trim().replace(/[(),"'\\]/g, " ");
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

function selectFilter(
  state: MatrxDataTableQueryState,
  column: string,
): string | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "select" && filter.value ? filter.value : null;
}

function booleanFilter(
  state: MatrxDataTableQueryState,
  column: string,
): boolean | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "boolean" ? filter.value : null;
}

function numberFilter(
  state: MatrxDataTableQueryState,
  column: string,
): { min?: number; max?: number } | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "number" ? filter : null;
}

function assertData<T>(data: T | null, error: unknown): T {
  if (error) throw error;
  if (data === null) throw new Error("Supabase returned no data.");
  return data;
}

async function listLinks(
  siteId: string,
  crawlId: string | null,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<InspectionPagedResult<InspectionLinkRow>> {
  const { from, to } = rangeFor(state);
  const sortColumns = {
    target_url: "target_url",
    is_internal: "is_internal",
    rel: "rel",
    anchor_text: "anchor_text",
    http_status: "http_status",
    position: "position",
    created_at: "created_at",
  } as const;
  const requestedSort = state.sort?.id ?? "created_at";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "created_at";
  const ascending = state.sort?.direction === "asc";
  const db = webDb(supabase);
  let query = db
    .from("link_edge")
    .select(CRAWL_LINK_SELECT, { count: "exact" })
    .eq("site_id", siteId)
    .is("deleted_at", null);
  if (crawlId) query = query.eq("snapshot.session_id", crawlId);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `target_url.ilike.%${search}%,anchor_text.ilike.%${search}%,rel.ilike.%${search}%`,
    );
  }
  const targetUrl = textFilter(state, "target_url");
  const anchorText = textFilter(state, "anchor_text");
  const rel = textFilter(state, "rel");
  const internal = booleanFilter(state, "is_internal");
  const httpStatus = numberFilter(state, "http_status");
  const position = numberFilter(state, "position");
  if (targetUrl) query = query.ilike("target_url", `%${targetUrl}%`);
  if (anchorText) query = query.ilike("anchor_text", `%${anchorText}%`);
  if (rel) query = query.ilike("rel", `%${rel}%`);
  if (internal !== null) query = query.eq("is_internal", internal);
  if (httpStatus?.min !== undefined)
    query = query.gte("http_status", httpStatus.min);
  if (httpStatus?.max !== undefined)
    query = query.lte("http_status", httpStatus.max);
  if (position?.min !== undefined) query = query.gte("position", position.min);
  if (position?.max !== undefined) query = query.lte("position", position.max);
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

/** List link edges across every snapshot for one accessible site. */
export function listSiteLinks(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
) {
  return listLinks(siteId, null, state, signal);
}

/** List only link edges captured by one crawl session. */
export function listCrawlLinks(
  siteId: string,
  crawlId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
) {
  return listLinks(siteId, crawlId, state, signal);
}

/** List immutable content captures produced by one crawl session. */
export async function listCrawlSnapshots(
  siteId: string,
  crawlId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<InspectionPagedResult<InspectionSnapshotRow>> {
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
  let query = webDb(supabase)
    .from("snapshot")
    .select(SNAPSHOT_SELECT, { count: "exact" })
    .eq("site_id", siteId)
    .eq("session_id", crawlId)
    .is("deleted_at", null);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `final_url.ilike.%${search}%,content_hash.ilike.%${search}%,body_ref.ilike.%${search}%`,
    );
  }
  const finalUrl = textFilter(state, "final_url");
  const contentHash = textFilter(state, "content_hash");
  const httpStatus = numberFilter(state, "http_status");
  const wordCount = numberFilter(state, "word_count");
  if (finalUrl) query = query.ilike("final_url", `%${finalUrl}%`);
  if (contentHash) query = query.ilike("content_hash", `%${contentHash}%`);
  if (httpStatus?.min !== undefined)
    query = query.gte("http_status", httpStatus.min);
  if (httpStatus?.max !== undefined)
    query = query.lte("http_status", httpStatus.max);
  if (wordCount?.min !== undefined)
    query = query.gte("word_count", wordCount.min);
  if (wordCount?.max !== undefined)
    query = query.lte("word_count", wordCount.max);
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

/** List screenshot records for one site; image bytes remain in public Storage. */
export async function listSiteScreenshots(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<InspectionPagedResult<InspectionScreenshotRow>> {
  const { from, to } = rangeFor(state);
  const sortColumns = {
    captured_at: "captured_at",
    kind: "kind",
    storage_bucket: "storage_bucket",
    storage_path: "storage_path",
    width: "width",
    height: "height",
  } as const;
  const requestedSort = state.sort?.id ?? "captured_at";
  const sortColumn =
    sortColumns[requestedSort as keyof typeof sortColumns] ?? "captured_at";
  const ascending = state.sort?.direction === "asc";
  let query = webDb(supabase)
    .from("screenshot")
    .select(SCREENSHOT_SELECT, { count: "exact" })
    .eq("site_id", siteId)
    .is("deleted_at", null);
  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `storage_path.ilike.%${search}%,storage_bucket.ilike.%${search}%,kind.ilike.%${search}%`,
    );
  }
  const kind = selectFilter(state, "kind");
  const storagePath = textFilter(state, "storage_path");
  if (kind) query = query.eq("kind", kind);
  if (storagePath) query = query.ilike("storage_path", `%${storagePath}%`);
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

/** Build the durable public-object URL stored by the standalone crawler. */
export function screenshotPublicUrl(
  screenshot: Pick<InspectionScreenshotRow, "storage_bucket" | "storage_path">,
): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(
    /\/+$/,
    "",
  );
  if (!baseUrl) return null;
  const bucket = encodeURIComponent(screenshot.storage_bucket);
  const path = screenshot.storage_path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return path ? `${baseUrl}/storage/v1/object/public/${bucket}/${path}` : null;
}
