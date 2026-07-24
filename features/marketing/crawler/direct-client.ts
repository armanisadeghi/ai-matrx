import { parseNdjsonStream } from "@/lib/api/stream-parser";
import type { TypedStreamEvent } from "@/lib/api/types";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { supabase } from "@/utils/supabase/client";
import { resolveServiceBaseUrl } from "@/lib/api/resolve-service-url";

/** Feed every scraper-boundary failure to the admin Error Inspector. */
function captureCrawlerError(input: {
  path: string;
  message: string;
  userMessage?: string;
  status?: number;
  raw?: unknown;
}): void {
  try {
    captureError({
      source: "marketing-crawler",
      relation: `scraper:${input.path}`,
      message: input.message,
      userMessage: input.userMessage,
      status: input.status,
      raw: input.raw,
    });
  } catch {
    /* capture must never break the caller */
  }
}

export interface CrawlStartOptions {
  max_pages: number;
  max_depth: number | null;
  concurrency: number;
  follow_subdomains: boolean;
  respect_robots: boolean;
  seed_from_sitemap: boolean;
  include_patterns: string[];
  exclude_patterns: string[];
  politeness_delay_ms: number;
  render_mode:
    "http_only" | "http_first" | "browser_always" | "browser_with_screenshot";
  capture_screenshots: boolean;
  screenshot_kinds: string[];
  seed_urls: string[];
  list_mode: boolean;
  host_rps: number;
  host_burst: number;
}

export interface CrawlLiveEvent {
  event_type:
    | "crawl_session_created"
    | "crawl_started"
    | "page_discovered"
    | "url_classified"
    | "page_fetched"
    | "page_parsed"
    | "page_failed"
    | "crawl_progress"
    | "issue_detected"
    | "crawl_completed"
    | "crawl_warning"
    | "initialize_step";
  run_id: string;
  session_id?: string | null;
  site_id?: string | null;
  sequence?: number | null;
  ts?: string;
  [key: string]: unknown;
}

/** The four concurrent initialize steps, in display order. */
export const INITIALIZE_STEP_NAMES = [
  "identity",
  "screenshots",
  "sitemaps",
  "discovered",
] as const;

export type InitializeStepName = (typeof INITIALIZE_STEP_NAMES)[number];

export type InitializeStepStatus = "started" | "complete" | "failed";

export interface InitializeStepEvent {
  step: InitializeStepName;
  status: InitializeStepStatus;
  /** Item count reported by the step's completion payload, when present. */
  count: number | null;
  /** Human-readable failure message, when status === "failed". */
  message: string | null;
  errorType: string | null;
}

function isInitializeStepName(value: unknown): value is InitializeStepName {
  return (
    typeof value === "string" &&
    (INITIALIZE_STEP_NAMES as readonly string[]).includes(value)
  );
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

/**
 * Narrow a live crawl event to the granular initialize-step contract
 * (`{event_type: "initialize_step", step, status, ...}`). Returns null for
 * every other event — including streams from scraper deploys that predate
 * the contract, which is the graceful-degradation signal consumers key on.
 */
export function initializeStepFromEvent(
  event: CrawlLiveEvent | null,
): InitializeStepEvent | null {
  if (!event || event.event_type !== "initialize_step") return null;
  const { step, status } = event as { step?: unknown; status?: unknown };
  if (!isInitializeStepName(step)) return null;
  if (status !== "started" && status !== "complete" && status !== "failed") {
    return null;
  }
  return {
    step,
    status,
    count: firstNumber(
      event.count,
      event.found,
      event.captured,
      event.discovered,
    ),
    message: firstString(event.user_message, event.message, event.error),
    errorType: firstString(event.error_type),
  };
}

export interface CrawlStreamCallbacks {
  signal?: AbortSignal;
  onConnected?: (connection: {
    sessionId: string;
    siteId: string | null;
  }) => void;
  onEvent?: (
    event: TypedStreamEvent,
    crawlEvent: CrawlLiveEvent | null,
  ) => void;
}

export interface CrawlStreamResult {
  sessionId: string;
  siteId: string | null;
  lastSequence: number;
}

export const defaultCrawlOptions: CrawlStartOptions = {
  max_pages: 500,
  max_depth: null,
  concurrency: 8,
  follow_subdomains: false,
  respect_robots: false,
  seed_from_sitemap: true,
  include_patterns: [],
  exclude_patterns: [],
  politeness_delay_ms: 0,
  render_mode: "http_first",
  capture_screenshots: true,
  screenshot_kinds: [],
  seed_urls: [],
  list_mode: false,
  host_rps: 4,
  host_burst: 8,
};

export function scraperOrigin(): string {
  return resolveServiceBaseUrl("scraper");
}

export function crawlerCommandUrl(path: string): string {
  return `${scraperOrigin()}/api/scraper/crawler/${path.replace(/^\/+/, "")}`;
}

export function crawlEventFromStream(
  event: TypedStreamEvent,
): CrawlLiveEvent | null {
  if (event.event !== "data") return null;
  const data = event.data as unknown;
  if (
    typeof data !== "object" ||
    data === null ||
    !("event_type" in data) ||
    typeof (data as { event_type?: unknown }).event_type !== "string"
  ) {
    return null;
  }
  return data as CrawlLiveEvent;
}

async function bearerToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in before starting a site crawl.");
  return token;
}

export function crawlerErrorMessage(
  status: number,
  detail: string | undefined,
): string {
  const normalized = detail?.toLowerCase() ?? "";
  if (status === 401 || normalized.includes("sign in")) {
    return "Your session has expired. Sign in again, then retry.";
  }
  if (status === 404) {
    return "The scraper doesn’t support this command yet — the server-side deploy is pending. (404 from the scraper service.)";
  }
  if (
    status === 403 ||
    normalized.includes("editor access") ||
    normalized.includes("permission")
  ) {
    return "You don’t have permission to manage this site. Ask a site admin for editor access.";
  }
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    normalized.includes("database") ||
    normalized.includes("storage") ||
    normalized.includes("unavailable")
  ) {
    return "The crawler is temporarily unavailable. Please retry in a moment.";
  }
  return detail
    ? `${detail} (HTTP ${status})`
    : `The crawler couldn’t complete this request (HTTP ${status}). Please retry.`;
}

async function responseError(
  response: Response,
  path: string,
): Promise<Error> {
  let detail: string | undefined;
  let raw: unknown;
  try {
    const payload = (await response.json()) as {
      detail?: string;
      user_message?: string;
      message?: string;
    };
    raw = payload;
    detail = payload.user_message || payload.detail || payload.message;
  } catch {
    /* non-JSON body */
  }
  const friendly = crawlerErrorMessage(response.status, detail);
  captureCrawlerError({
    path,
    message: detail ?? `HTTP ${response.status}`,
    userMessage: friendly,
    status: response.status,
    raw,
  });
  return new Error(friendly);
}

async function streamCommand(
  path: string,
  body: Record<string, unknown> | null,
  callbacks: CrawlStreamCallbacks = {},
): Promise<CrawlStreamResult> {
  const token = await bearerToken();
  const response = await fetch(crawlerCommandUrl(path), {
    method: "POST",
    headers: {
      Accept: "application/x-ndjson",
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: callbacks.signal,
  });
  if (!response.ok) throw await responseError(response, path);

  const sessionId = response.headers.get("X-Crawl-Session-Id") || "";
  const siteId = response.headers.get("X-Site-Id");
  if (!sessionId) {
    throw new Error("The scraper did not return a crawl session identifier.");
  }
  callbacks.onConnected?.({ sessionId, siteId });

  let lastSequence = 0;
  let ended = false;
  const { events } = parseNdjsonStream(response, callbacks.signal);
  for await (const event of events) {
    const crawlEvent = crawlEventFromStream(event);
    if (crawlEvent?.sequence) {
      lastSequence = Math.max(lastSequence, crawlEvent.sequence);
    }
    callbacks.onEvent?.(event, crawlEvent);
    if (event.event === "error") {
      const data = event.data as unknown as {
        user_message?: string;
        message?: string;
        detail?: string;
      };
      const message =
        data.user_message ||
        data.message ||
        data.detail ||
        "The crawler reported an error.";
      captureCrawlerError({ path, message, userMessage: message, raw: data });
      throw new Error(message);
    }
    if (event.event === "end") ended = true;
  }

  if (!ended && !callbacks.signal?.aborted) {
    captureCrawlerError({
      path,
      message: "Stream ended before its completion event.",
      userMessage: "The crawler stream ended before its completion event.",
    });
    throw new Error("The crawler stream ended before its completion event.");
  }
  return { sessionId, siteId, lastSequence };
}

/**
 * One-call site initialization: homepage snapshot, sitemap discovery,
 * favicon/logo/social/contact candidates into web.discovered_item, and the
 * 4 display screenshots. Idempotent server-side; safe to re-run.
 */
export function initializeSite(
  siteId: string,
  callbacks?: CrawlStreamCallbacks,
): Promise<CrawlStreamResult> {
  return streamCommand(`sites/${siteId}/initialize`, null, callbacks);
}

/**
 * Pull Search Console page stats into web.gsc_page_stat for one site and
 * stamp web.site.gsc_synced_at / gsc_sync. Requires a configured GSC binding.
 */
export function syncGsc(
  siteId: string,
  callbacks?: CrawlStreamCallbacks,
): Promise<CrawlStreamResult> {
  return streamCommand(`sites/${siteId}/gsc/sync`, null, callbacks);
}

/** Standalone sitemap discovery + canonical-page ingestion for one site. */
export function syncSitemaps(
  siteId: string,
  callbacks?: CrawlStreamCallbacks,
): Promise<CrawlStreamResult> {
  return streamCommand(`sites/${siteId}/sitemaps/sync`, null, callbacks);
}

export function bootstrapSite(
  siteId: string,
  callbacks?: CrawlStreamCallbacks,
): Promise<CrawlStreamResult> {
  return streamCommand(`sites/${siteId}/bootstrap`, null, callbacks);
}

/**
 * On-demand capture of ONE page — "get the freshest version right now".
 * Works for existing canonical pages AND never-captured URLs; the server
 * validates the canonical-host boundary and reuses the bootstrap single-URL
 * pipeline (snapshot + head_tags + seo_metrics + viewport screenshot).
 */
export function fetchPageNow(
  siteId: string,
  url: string,
  callbacks?: CrawlStreamCallbacks,
): Promise<CrawlStreamResult> {
  return streamCommand(`sites/${siteId}/pages/fetch`, { url }, callbacks);
}

export function startSiteCrawl(
  siteId: string,
  options: CrawlStartOptions,
  callbacks?: CrawlStreamCallbacks,
): Promise<CrawlStreamResult> {
  return streamCommand(
    `sites/${siteId}/sessions`,
    options as unknown as Record<string, unknown>,
    callbacks,
  );
}

/**
 * Backfill `web.link_edge.target_page_id` for the site's internal edges
 * that were left unresolved at crawl-write time (rare — most edges resolve
 * inline during the crawl).
 */
export function resolveSiteLinks(
  siteId: string,
  callbacks?: CrawlStreamCallbacks,
): Promise<CrawlStreamResult> {
  return streamCommand(`sites/${siteId}/links/resolve`, null, callbacks);
}

/**
 * Populate `web.link_edge.http_status` for the site's internal + external
 * edges (M-51 / DEF-15 / D74) — internal edges resolve from their target
 * page's latest crawled snapshot (no network); external targets get a
 * bounded, polite live HEAD/GET check. Idempotent: only NULL statuses are
 * touched (the server route does not yet expose a `recheck` toggle).
 */
export function checkSiteLinks(
  siteId: string,
  callbacks?: CrawlStreamCallbacks,
): Promise<CrawlStreamResult> {
  return streamCommand(`sites/${siteId}/links/check`, null, callbacks);
}

export async function cancelCrawl(sessionId: string): Promise<void> {
  const token = await bearerToken();
  const response = await fetch(
    crawlerCommandUrl(`sessions/${sessionId}/cancel`),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok)
    throw await responseError(response, `sessions/${sessionId}/cancel`);
}
