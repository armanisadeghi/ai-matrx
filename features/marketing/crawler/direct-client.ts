import { parseNdjsonStream } from "@/lib/api/stream-parser";
import type { TypedStreamEvent } from "@/lib/api/types";
import { supabase } from "@/utils/supabase/client";

const DEFAULT_SCRAPER_ORIGIN = "https://scraper.app.matrxserver.com";

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
    | "crawl_warning";
  run_id: string;
  session_id?: string | null;
  site_id?: string | null;
  sequence?: number | null;
  ts?: string;
  [key: string]: unknown;
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
  const configured = process.env.NEXT_PUBLIC_SCRAPER_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") return DEFAULT_SCRAPER_ORIGIN;
  throw new Error(
    "NEXT_PUBLIC_SCRAPER_URL is required outside production; refusing to fall back to the production scraper.",
  );
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
  return detail || "The crawler couldn’t complete this request. Please retry.";
}

async function responseError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as {
      detail?: string;
      user_message?: string;
      message?: string;
    };
    return new Error(
      crawlerErrorMessage(
        response.status,
        payload.user_message || payload.detail || payload.message,
      ),
    );
  } catch {
    return new Error(crawlerErrorMessage(response.status, undefined));
  }
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
  if (!response.ok) throw await responseError(response);

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
      throw new Error(
        data.user_message ||
          data.message ||
          data.detail ||
          "The crawler reported an error.",
      );
    }
    if (event.event === "end") ended = true;
  }

  if (!ended && !callbacks.signal?.aborted) {
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

export function bootstrapSite(
  siteId: string,
  callbacks?: CrawlStreamCallbacks,
): Promise<CrawlStreamResult> {
  return streamCommand(`sites/${siteId}/bootstrap`, null, callbacks);
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
  if (!response.ok) throw await responseError(response);
}
