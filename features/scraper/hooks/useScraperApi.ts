"use client";

/**
 * useScraperApi — Unified HTTP hook for all scraper endpoints.
 *
 * Uses the central useBackendApi hook (reads active server from Redux apiConfigSlice)
 * so it respects whatever backend is selected (localhost, dev, prod, etc.).
 *
 * All endpoints stream NDJSON. This hook buffers the full stream and resolves
 * when the `end` event arrives.
 *
 * Endpoints:
 *   POST /api/scraper/quick-scrape          — scrape one or more URLs
 *   POST /api/scraper/search                — search keywords (no scraping)
 *   POST /api/scraper/search-and-scrape     — search + scrape results
 *   POST /api/scraper/search-and-scrape-limited — single keyword, limited pages
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { consumeStream } from "@/lib/api/stream-parser";
import type {
  PhasePayload,
  TypedDataPayload,
  ErrorPayload,
  EndPayload,
  InfoPayload,
  TypedStreamEvent,
} from "@/lib/api/types";
import { extractErrorMessage } from "@/utils/errors";
import type {
  QuickScrapeRequest,
  SearchKeywordsRequest,
  SearchAndScrapeRequest,
  SearchAndScrapeLimitedRequest,
  ScrapedResult,
  SearchResult,
  SearchResultItem,
} from "@/features/scraper/types/scraper-api";

// ============================================================================
// Types
// ============================================================================

export interface ScraperOverview {
  page_title?: string;
  url?: string;
  website?: string;
  char_count?: number;
  has_structured_content?: boolean;
  outline?: Record<string, string[]>;
  [key: string]: unknown;
}

export interface ScraperLinks {
  internal?: string[];
  external?: string[];
  images?: string[];
  documents?: string[];
  others?: string[];
  audio?: string[];
  videos?: string[];
  archives?: string[];
}

export interface ScraperResult {
  url: string;
  /** Best available text — markdown_renderable > ai_research_content > ai_content > text_data */
  textContent: string;
  /** When present, prefer {@link ScrapedContentPretty} for display */
  markdownRenderable?: string;
  /**
   * Plain-ish extract: text_data / ai_* fields, before the markdown-first `textContent` chain.
   * Use for a secondary “plain text” tab; falls back to `textContent` when empty.
   */
  plainTextContent: string;
  overview: ScraperOverview;
  /** Structured/schema data (structured_data or fallback metadata) */
  structuredData: object;
  /** Organized content sections — { sections: [...] } if the API returns an array */
  organizedData: object;
  links: ScraperLinks;
  images: string[];
  mainImage: string | null;
  metadata: { execution_time_ms?: number; [key: string]: unknown };
  scrapedAt: string;
}

export interface ScraperApiState {
  data: ScraperResult | null;
  /** Raw API result object — unmodified, for inspection/debugging */
  rawData: Record<string, unknown> | null;
  /** Legacy grouped search results */
  searchResults: SearchResult[];
  /** Flat search result items exactly as returned by the API */
  searchItems: SearchResultItem[];
  isLoading: boolean;
  hasError: boolean;
  error: string | null;
  statusMessage: string | null;
}

/** Rich failure info for scraper demos and debugging — safe to JSON.stringify */
export interface ScraperApiErrorDiagnostics {
  hook: "useScraperApi";
  /** Hook method that was running */
  operation:
    | "scrapeUrlRaw"
    | "scrapeUrl"
    | "scrapeUrls"
    | "search"
    | "searchAndScrape"
    | "searchAndScrapeLimited";
  /** Last pipeline stage reached before the error */
  stage:
    | "api.post"
    | "consumeScrapeStream"
    | "validate_nonempty_results"
    | "validate_result_success"
    | "mapToScraperResult"
    | "normalize_search_results"
    | "unknown";
  message: string;
  stack?: string;
  cause?: unknown;
  at: string;
  received: {
    requestedUrl?: string;
    requestedUrls?: string[];
    endpoint: string;
    streamEventLog: Array<Record<string, unknown>>;
    resultsCount: number;
    results: unknown;
    envelopeMetadata: Record<string, unknown>;
    firstResult: Record<string, unknown> | null;
    /** Index of the row that failed validation/mapping (batch scrapes) */
    failedResultIndex?: number;
    /** Full request body clone for search / search-and-scrape ops */
    requestPayload?: unknown;
    /** Captured after a successful `fetch` (so missing if failure was before Response) */
    http?: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
    };
  };
}

function captureHttpSnapshot(
  response: Response,
): NonNullable<ScraperApiErrorDiagnostics["received"]["http"]> {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

/**
 * Deep-clone a value into JSON-serializable structure for diagnostics.
 * No string/array/key truncation — only non-JSON types are transformed and
 * circular references become the string "[Circular]".
 */
export function cloneForDiagnostics(value: unknown): unknown {
  const seen = new WeakMap<object, unknown>();

  const walk = (v: unknown): unknown => {
    if (v === undefined || v === null) return v;
    const ty = typeof v;
    if (ty === "string" || ty === "number" || ty === "boolean") return v;
    if (ty === "bigint") return (v as bigint).toString();
    if (ty === "symbol") return String(v as symbol);
    if (ty === "function") {
      return `[Function:${(v as (...a: unknown[]) => unknown).name || "anonymous"}]`;
    }
    if (v instanceof Date) return v.toISOString();
    if (v instanceof Error) {
      const e = v as Error;
      return {
        __type: "Error",
        name: e.name,
        message: e.message,
        stack: e.stack,
        cause: e.cause !== undefined ? walk(e.cause) : undefined,
      };
    }
    if (typeof v !== "object") return String(v);

    const o = v as object;
    if (seen.has(o)) return "[Circular]";

    if (Array.isArray(v)) {
      const copy: unknown[] = [];
      seen.set(o, copy);
      for (let i = 0; i < v.length; i++) copy.push(walk(v[i]));
      return copy;
    }

    const copy: Record<string, unknown> = {};
    seen.set(o, copy);
    const rec = v as Record<string, unknown>;
    for (const k of Object.keys(rec)) copy[k] = walk(rec[k]);
    return copy;
  };

  return walk(value);
}

// ============================================================================
// Scrape row validation — API can return 200 + stream with success: false rows
// ============================================================================

/** True when the backend marked this scrape result row as failed */
export function isRawScrapeRowFailed(r: Record<string, unknown>): boolean {
  return r.success === false || r.status === "error";
}

export function rawScrapeRowFailureMessage(r: Record<string, unknown>): string {
  return (
    (r.failure_reason as string) ?? (r.error as string) ?? "Scraping failed"
  );
}

function assertRawScrapeRowSucceeded(
  r: Record<string, unknown>,
  contextLabel: string,
): void {
  if (!isRawScrapeRowFailed(r)) return;
  const base = rawScrapeRowFailureMessage(r);
  throw new Error(contextLabel ? `${contextLabel}: ${base}` : base);
}

function assertAllRawScrapeRowsSucceeded(
  results: Array<Record<string, unknown>>,
  labelAtIndex: (i: number) => string,
): void {
  for (let i = 0; i < results.length; i++) {
    assertRawScrapeRowSucceeded(results[i], labelAtIndex(i));
  }
}

function makeScraperDiagnostics(
  operation: ScraperApiErrorDiagnostics["operation"],
  stage: ScraperApiErrorDiagnostics["stage"],
  err: unknown,
  received: ScraperApiErrorDiagnostics["received"],
): ScraperApiErrorDiagnostics {
  const msg = extractErrorMessage(err);
  const causeRaw =
    err instanceof Error && err.cause !== undefined ? err.cause : undefined;
  return {
    hook: "useScraperApi",
    operation,
    stage,
    message: msg,
    stack: err instanceof Error ? err.stack : undefined,
    cause: causeRaw !== undefined ? cloneForDiagnostics(causeRaw) : undefined,
    at: new Date().toISOString(),
    received,
  };
}

function snapshotReceived(
  streamEventLog: Array<Record<string, unknown>>,
  partialRef: {
    results: Array<Record<string, unknown>>;
    metadata: Record<string, unknown>;
  },
  endpoint: string,
  extras?: Partial<
    Pick<
      ScraperApiErrorDiagnostics["received"],
      | "requestedUrl"
      | "requestedUrls"
      | "failedResultIndex"
      | "requestPayload"
      | "http"
    >
  >,
): ScraperApiErrorDiagnostics["received"] {
  const results = partialRef.results;
  const metadata = partialRef.metadata;
  const firstResult = results[0] ?? null;
  const received: ScraperApiErrorDiagnostics["received"] = {
    endpoint,
    streamEventLog: cloneForDiagnostics(streamEventLog) as Array<
      Record<string, unknown>
    >,
    resultsCount: results.length,
    results: cloneForDiagnostics(results),
    envelopeMetadata: cloneForDiagnostics(metadata) as Record<string, unknown>,
    firstResult: firstResult
      ? (cloneForDiagnostics(firstResult) as Record<string, unknown>)
      : null,
  };
  if (extras?.requestedUrl !== undefined)
    received.requestedUrl = extras.requestedUrl;
  if (extras?.requestedUrls !== undefined)
    received.requestedUrls = extras.requestedUrls;
  if (extras?.failedResultIndex !== undefined)
    received.failedResultIndex = extras.failedResultIndex;
  if (extras?.requestPayload !== undefined)
    received.requestPayload = cloneForDiagnostics(extras.requestPayload);
  if (extras?.http !== undefined) received.http = extras.http;
  return received;
}

type StreamCtx = {
  streamEventLog: Array<Record<string, unknown>>;
  partialRef: {
    results: Array<Record<string, unknown>>;
    metadata: Record<string, unknown>;
  };
};

function createStreamCtx(): StreamCtx {
  return {
    streamEventLog: [],
    partialRef: { results: [], metadata: {} },
  };
}

export interface UseScraperApiReturn extends ScraperApiState {
  /** Structured failure report (JSON-serializable). Only set when hasError. */
  errorDiagnostics: ScraperApiErrorDiagnostics | null;
  scrapeUrl: (
    url: string,
    options?: Partial<QuickScrapeRequest>,
  ) => Promise<ScraperResult | null>;
  /** Same as scrapeUrl but never touches global isLoading/error — for background per-item scrapes */
  scrapeUrlSilent: (
    url: string,
    options?: Partial<QuickScrapeRequest>,
  ) => Promise<ScraperResult | null>;
  scrapeUrlRaw: (
    url: string,
    options?: Partial<QuickScrapeRequest>,
  ) => Promise<Record<string, unknown> | null>;
  scrapeUrls: (
    urls: string[],
    options?: Partial<QuickScrapeRequest>,
  ) => Promise<ScraperResult[] | null>;
  search: (
    request: SearchKeywordsRequest,
  ) => Promise<SearchResultItem[] | null>;
  searchAndScrape: (
    request: SearchAndScrapeRequest,
  ) => Promise<ScraperResult[] | null>;
  searchAndScrapeLimited: (
    request: SearchAndScrapeLimitedRequest,
  ) => Promise<ScraperResult[] | null>;
  /** Abort any in-flight request immediately */
  cancel: () => void;
  reset: () => void;
}

// ============================================================================
// Raw result envelope shape from the API (V2: uses `type` discriminator)
// ============================================================================

interface ResultEnvelope {
  type?: string;
  metadata?: Record<string, unknown>;
  results?: Array<Record<string, unknown>>;
}

// ============================================================================
// Stream consumer — shared by all endpoints (delegates to V2 consumeStream)
// ============================================================================

/** Extract results from a V2 typed data payload or untyped record */
function extractResultsFromData(
  eventData: TypedDataPayload | Record<string, unknown>,
  results: Array<Record<string, unknown>>,
  metadata: Record<string, unknown>,
): {
  results: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
} {
  const d = eventData as Record<string, unknown>;

  if (Array.isArray(d.results) && (d.results as unknown[]).length > 0) {
    results = [...results, ...(d.results as Array<Record<string, unknown>>)];
    if (d.metadata) metadata = d.metadata as Record<string, unknown>;
  } else if ("text_data" in d || "overview" in d || "url" in d) {
    results = [...results, d];
  } else if ("keyword" in d) {
    results = [...results, d];
  } else if (process.env.NODE_ENV === "development") {
    const dataType = d.type as string | undefined;
    console.debug(
      "[scraper stream] data event with unrecognized shape — type:",
      dataType,
      "keys:",
      Object.keys(d).join(", "),
    );
  }

  return { results, metadata };
}

async function consumeScrapeStream(
  response: Response,
  onStatus: (msg: string) => void,
  streamEventLog?: Array<Record<string, unknown>>,
  partialRef?: {
    results: Array<Record<string, unknown>>;
    metadata: Record<string, unknown>;
  },
  signal?: AbortSignal,
): Promise<{
  results: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
}> {
  let results: Array<Record<string, unknown>> = [];
  let metadata: Record<string, unknown> = {};
  let sawEndEvent = false;
  let eventCount = 0;

  const syncPartial = () => {
    if (partialRef) {
      partialRef.results = results;
      partialRef.metadata = metadata;
    }
  };

  const pushLog = (record: Record<string, unknown>) => {
    if (!streamEventLog) return;
    streamEventLog.push({ t: new Date().toISOString(), ...record });
  };

  await consumeStream(
    response,
    {
      onEvent: (event: TypedStreamEvent) => {
        eventCount++;
        pushLog({ kind: "ndjson_event", parsed: cloneForDiagnostics(event) });

        if (process.env.NODE_ENV === "development") {
          const d = event.data as Record<string, unknown> | undefined;
          console.debug("[scraper stream] raw event:", {
            eventType: event.event,
            eventDataKeys: d ? Object.keys(d).join(", ") : "(no data)",
            dataType: d?.type,
            hasResults: Array.isArray(d?.results),
            resultsCount: Array.isArray(d?.results)
              ? (d!.results as unknown[]).length
              : 0,
          });
        }
      },

      onPhase: (data: PhasePayload) => {
        const phaseLabels: Record<string, string> = {
          connected: "Connected",
          processing: "Processing...",
          searching: "Searching...",
          scraping: "Scraping...",
          analyzing: "Analyzing...",
          synthesizing: "Synthesizing...",
          generating: "Generating...",
          complete: "Complete",
        };
        const msg = phaseLabels[data.phase] ?? data.phase;
        onStatus(msg);
      },

      onReasoning: (data) => {
        if (data.state === "started") onStatus("Reasoning...");
      },

      onInfo: (data: InfoPayload) => {
        const msg = data.user_message ?? data.system_message;
        if (msg) onStatus(msg);
      },

      onData: (data: TypedDataPayload | Record<string, unknown>) => {
        const extracted = extractResultsFromData(data, results, metadata);
        results = extracted.results;
        metadata = extracted.metadata;
        syncPartial();
      },

      onError: (data: ErrorPayload) => {
        pushLog({
          kind: "stream_error_event",
          parsed: cloneForDiagnostics(data),
        });
        const msg = data.user_message ?? data.message ?? "Scraping failed";
        throw new Error(msg, {
          cause: {
            source: "consumeScrapeStream",
            streamErrorPayload: data,
          },
        });
      },

      onEnd: (_data: EndPayload) => {
        sawEndEvent = true;
      },
    },
    signal,
  );

  if (!sawEndEvent && results.length === 0) {
    if (signal?.aborted) {
      throw new Error(
        "Scrape stream was cancelled (request aborted) before any results were parsed. " +
          "If you did not cancel, another scrape may have replaced this one (useScraperApi uses a single in-flight abort controller per hook).",
        {
          cause: {
            code: "STREAM_ABORTED_NO_RESULTS",
            sawEndEvent,
            parsedEventCount: eventCount,
          },
        },
      );
    }

    const tailHint =
      eventCount > 0
        ? `${eventCount} NDJSON line(s) were received but none became scrape rows — either the payload shape is not mapped yet, or the connection closed while a very large single-line JSON was still streaming (final line incomplete → parse skipped). Inspect received.streamEventLog (especially the last event keys). `
        : "";

    throw new Error(
      'NDJSON stream closed before an "end" event and before any scrape results were parsed. ' +
        tailHint +
        "Otherwise the link may have been cut by a proxy idle timeout, a server reset, or the Python process ending the response early. Check Coolify/nginx read timeouts and server logs for the same request id.",
      {
        cause: {
          code: "STREAM_TRUNCATED_NO_END_NO_RESULTS",
          sawEndEvent,
          parsedEventCount: eventCount,
        },
      },
    );
  }

  if (process.env.NODE_ENV === "development") {
    console.debug(
      "[scraper stream] finished — results count:",
      results.length,
      "sawEndEvent:",
      sawEndEvent,
      "metadata:",
      metadata,
    );
  }

  syncPartial();
  return { results, metadata };
}

// ============================================================================
// Map raw API result → typed ScraperResult
// ============================================================================

function mapToScraperResult(
  raw: Record<string, unknown>,
  fallbackUrl: string,
  envelopeMetadata: Record<string, unknown>,
): ScraperResult {
  const markdownRenderableRaw = (raw.markdown_renderable as string)?.trim();
  const markdownRenderable = markdownRenderableRaw || undefined;

  // Plain variants (no markdown-first) — for “plain text” secondary views
  const plainChain =
    (raw.text_data as string) ||
    (raw.ai_content as string) ||
    (raw.ai_research_content as string) ||
    (raw.ai_research_with_images as string) ||
    "";

  // The API now sends several text variants — pick the richest available one.
  // Priority: markdown_renderable > ai_research_content > ai_content > text_data > legacy fields
  const textContent =
    (raw.markdown_renderable as string) ||
    (raw.ai_research_content as string) ||
    (raw.ai_content as string) ||
    (raw.text_data as string) ||
    (raw.content as string) ||
    (raw.text as string) ||
    (raw.page_content as string) ||
    "";

  const plainTextContent = plainChain || textContent;

  const rawOverview = (raw.overview as ScraperOverview) || {};

  // page_title: prefer overview field, then top-level title
  const page_title =
    rawOverview.page_title ??
    (raw.page_title as string) ??
    (raw.title as string) ??
    undefined;

  // char_count: prefer overview field, then compute from chosen text
  const char_count =
    rawOverview.char_count != null && rawOverview.char_count > 0
      ? rawOverview.char_count
      : textContent.length > 0
        ? textContent.length
        : undefined;

  const overview: ScraperOverview = {
    ...rawOverview,
    page_title,
    char_count,
  };

  // structured_data: prefer dedicated field, fall back to top-level metadata object
  const structuredData =
    (raw.structured_data as object) || (raw.metadata as object) || {};

  // organized_data: API now sends an array; wrap it if needed so consumers get a consistent object
  const rawOrgData = raw.organized_data;
  const organizedData: object = Array.isArray(rawOrgData)
    ? { sections: rawOrgData }
    : (rawOrgData as object) || {};

  // links — same shape, just defensive fallback
  const links = (raw.links as ScraperLinks) || {};

  // images: prefer dedicated images array, then links.images
  const images = (raw.images as string[])?.length
    ? (raw.images as string[])
    : links.images || [];

  // result-level metadata (the per-result one, not the envelope-level one)
  const resultMetadata =
    (raw.metadata as { execution_time_ms?: number }) || envelopeMetadata || {};

  return {
    url: (raw.url as string) || (raw.response_url as string) || fallbackUrl,
    textContent,
    markdownRenderable,
    plainTextContent,
    overview,
    structuredData,
    organizedData,
    links,
    images,
    mainImage: (raw.main_image as string) || null,
    metadata: resultMetadata,
    scrapedAt: (raw.scraped_at as string) || new Date().toISOString(),
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useScraperApi(): UseScraperApiReturn {
  const api = useBackendApi();

  const [data, setData] = useState<ScraperResult | null>(null);
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchItems, setSearchItems] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDiagnostics, setErrorDiagnostics] =
    useState<ScraperApiErrorDiagnostics | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // AbortController for in-flight requests — cancelled on unmount or via cancel()
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setStatusMessage(null);
    setErrorDiagnostics(null);
  }, []);

  /** Create a fresh AbortController, replacing any previous one */
  const newSignal = useCallback((): AbortSignal => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller.signal;
  }, []);

  const onStatus = useCallback((msg: string) => setStatusMessage(msg), []);

  // --------------------------------------------------------------------------
  // scrapeUrl — single URL, returns first ScraperResult
  // --------------------------------------------------------------------------
  const scrapeUrl = useCallback(
    async (
      url: string,
      options: Partial<QuickScrapeRequest> = {},
    ): Promise<ScraperResult | null> => {
      setIsLoading(true);
      setError(null);
      setErrorDiagnostics(null);
      setData(null);
      setStatusMessage(null);

      const ctx = createStreamCtx();
      let stage: ScraperApiErrorDiagnostics["stage"] = "api.post";
      let httpSnapshot:
        ScraperApiErrorDiagnostics["received"]["http"] | undefined;
      try {
        const signal = newSignal();
        const body: QuickScrapeRequest = {
          urls: [url],
          use_cache: true,
          get_text_data: true,
          get_overview: true,
          get_links: true,
          get_main_image: true,
          get_organized_data: true,
          get_structured_data: true,
          get_content_filter_removal_details: false,
          include_highlighting_markers: false,
          include_media: true,
          include_media_links: true,
          include_media_description: true,
          include_anchors: true,
          anchor_size: 100,
          ...options,
        };

        stage = "api.post";
        // Guests authenticate with a fingerprint that GlobalAuthSync resolves
        // ~100ms after mount. Anonymous surfaces (the public /seo tools) can
        // fire before that lands, so wait for an identity or the backend
        // rejects the call with auth_required.
        await api.waitForAuth();
        const response = await api.post(
          ENDPOINTS.scraper.quickScrape,
          body,
          signal,
        );
        httpSnapshot = captureHttpSnapshot(response);
        stage = "consumeScrapeStream";
        const { results, metadata } = await consumeScrapeStream(
          response,
          onStatus,
          ctx.streamEventLog,
          ctx.partialRef,
          signal,
        );

        stage = "validate_nonempty_results";
        if (!results.length)
          throw new Error("No results returned from scraper");

        const first = results[0];
        stage = "validate_result_success";
        assertRawScrapeRowSucceeded(first, url);

        stage = "mapToScraperResult";
        const scraperResult = mapToScraperResult(first, url, metadata);
        setRawData(first);
        setData(scraperResult);
        setErrorDiagnostics(null);
        return scraperResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to scrape URL";
        const firstResult = ctx.partialRef.results[0] ?? null;
        if (firstResult) setRawData(firstResult);
        setErrorDiagnostics(
          makeScraperDiagnostics(
            "scrapeUrl",
            stage,
            err,
            snapshotReceived(
              ctx.streamEventLog,
              ctx.partialRef,
              ENDPOINTS.scraper.quickScrape,
              { requestedUrl: url, http: httpSnapshot },
            ),
          ),
        );
        setError(
          `${msg} — failed at useScraperApi.scrapeUrl → ${stage} (see errorDiagnostics)`,
        );
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [api, newSignal, onStatus],
  );

  // --------------------------------------------------------------------------
  // scrapeUrlSilent — scrape a single URL without touching global loading state
  // Useful for per-item background scrapes that should not block the whole UI.
  // --------------------------------------------------------------------------
  const scrapeUrlSilent = useCallback(
    async (
      url: string,
      options: Partial<QuickScrapeRequest> = {},
    ): Promise<ScraperResult | null> => {
      try {
        const body: QuickScrapeRequest = {
          urls: [url],
          use_cache: false,
          get_text_data: true,
          get_overview: true,
          get_links: true,
          get_main_image: false,
          get_organized_data: false,
          get_structured_data: false,
          get_content_filter_removal_details: false,
          include_highlighting_markers: false,
          include_media: false,
          include_media_links: false,
          include_media_description: false,
          include_anchors: false,
          anchor_size: 100,
          ...options,
        };

        await api.waitForAuth();
        const response = await api.post(ENDPOINTS.scraper.quickScrape, body);
        const { results, metadata } = await consumeScrapeStream(
          response,
          onStatus,
        );

        if (!results.length) throw new Error("No results returned");

        const first = results[0];
        assertRawScrapeRowSucceeded(first, url);

        return mapToScraperResult(first, url, metadata);
      } catch (err) {
        throw err;
      }
    },
    [api, onStatus],
  );

  // --------------------------------------------------------------------------
  // scrapeUrlRaw — same as scrapeUrl but returns the unmodified API result
  // --------------------------------------------------------------------------
  const scrapeUrlRaw = useCallback(
    async (
      url: string,
      options: Partial<QuickScrapeRequest> = {},
    ): Promise<Record<string, unknown> | null> => {
      setIsLoading(true);
      setError(null);
      setErrorDiagnostics(null);
      setData(null);
      setRawData(null);
      setStatusMessage(null);

      const streamEventLog: Array<Record<string, unknown>> = [];
      const partialRef: {
        results: Array<Record<string, unknown>>;
        metadata: Record<string, unknown>;
      } = { results: [], metadata: {} };

      let stage: ScraperApiErrorDiagnostics["stage"] = "api.post";
      let httpSnapshot:
        ScraperApiErrorDiagnostics["received"]["http"] | undefined;

      try {
        const signal = newSignal();
        const body: QuickScrapeRequest = {
          urls: [url],
          use_cache: true,
          get_text_data: true,
          get_overview: true,
          get_links: true,
          get_main_image: true,
          get_organized_data: true,
          get_structured_data: true,
          get_content_filter_removal_details: false,
          include_highlighting_markers: false,
          include_media: true,
          include_media_links: true,
          include_media_description: true,
          include_anchors: true,
          anchor_size: 100,
          ...options,
        };

        stage = "api.post";
        // Guests authenticate with a fingerprint that GlobalAuthSync resolves
        // ~100ms after mount. Anonymous surfaces (the public /seo tools) can
        // fire before that lands, so wait for an identity or the backend
        // rejects the call with auth_required.
        await api.waitForAuth();
        const response = await api.post(
          ENDPOINTS.scraper.quickScrape,
          body,
          signal,
        );
        httpSnapshot = captureHttpSnapshot(response);
        stage = "consumeScrapeStream";
        const consumed = await consumeScrapeStream(
          response,
          onStatus,
          streamEventLog,
          partialRef,
          signal,
        );
        const { results, metadata } = consumed;

        stage = "validate_nonempty_results";
        if (!results.length)
          throw new Error("No results returned from scraper");

        const first = results[0];
        stage = "validate_result_success";
        assertRawScrapeRowSucceeded(first, url);

        stage = "mapToScraperResult";
        setRawData(first);
        const scraperResult = mapToScraperResult(first, url, metadata);
        setData(scraperResult);
        setErrorDiagnostics(null);
        return first;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to scrape URL";
        const firstResult = partialRef.results[0] ?? null;
        if (firstResult) setRawData(firstResult);

        setErrorDiagnostics(
          makeScraperDiagnostics(
            "scrapeUrlRaw",
            stage,
            err,
            snapshotReceived(
              streamEventLog,
              partialRef,
              ENDPOINTS.scraper.quickScrape,
              {
                requestedUrl: url,
                http: httpSnapshot,
              },
            ),
          ),
        );
        setError(
          `${msg} — failed at useScraperApi.scrapeUrlRaw → ${stage} (see diagnostics JSON below)`,
        );
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [api, newSignal, onStatus],
  );

  // --------------------------------------------------------------------------
  // scrapeUrls — multiple URLs, returns array of ScraperResults
  // --------------------------------------------------------------------------
  const scrapeUrls = useCallback(
    async (
      urls: string[],
      options: Partial<QuickScrapeRequest> = {},
    ): Promise<ScraperResult[] | null> => {
      setIsLoading(true);
      setError(null);
      setErrorDiagnostics(null);
      setData(null);
      setStatusMessage(null);

      const ctx = createStreamCtx();
      let stage: ScraperApiErrorDiagnostics["stage"] = "api.post";
      let httpSnapshot:
        ScraperApiErrorDiagnostics["received"]["http"] | undefined;

      try {
        const signal = newSignal();
        const body: QuickScrapeRequest = {
          urls,
          use_cache: true,
          get_text_data: true,
          get_overview: true,
          get_links: true,
          get_main_image: true,
          get_organized_data: true,
          get_structured_data: true,
          get_content_filter_removal_details: false,
          include_highlighting_markers: false,
          include_media: true,
          include_media_links: true,
          include_media_description: true,
          include_anchors: true,
          anchor_size: 100,
          ...options,
        };

        stage = "api.post";
        // Guests authenticate with a fingerprint that GlobalAuthSync resolves
        // ~100ms after mount. Anonymous surfaces (the public /seo tools) can
        // fire before that lands, so wait for an identity or the backend
        // rejects the call with auth_required.
        await api.waitForAuth();
        const response = await api.post(
          ENDPOINTS.scraper.quickScrape,
          body,
          signal,
        );
        httpSnapshot = captureHttpSnapshot(response);
        stage = "consumeScrapeStream";
        const { results, metadata } = await consumeScrapeStream(
          response,
          onStatus,
          ctx.streamEventLog,
          ctx.partialRef,
          signal,
        );

        stage = "validate_nonempty_results";
        if (!results.length)
          throw new Error("No results returned from scraper");

        stage = "validate_result_success";
        assertAllRawScrapeRowsSucceeded(results, (i) => {
          const u = urls[i];
          return u ?? `#${i}`;
        });

        stage = "mapToScraperResult";
        const mapped: ScraperResult[] = [];
        for (let i = 0; i < results.length; i++) {
          try {
            mapped.push(
              mapToScraperResult(results[i], urls[i] ?? "", metadata),
            );
          } catch (mapErr) {
            throw new Error(
              `mapToScraperResult failed at index ${i} (${urls[i] ?? "?"}): ${extractErrorMessage(
                mapErr,
              )}`,
              { cause: { failedResultIndex: i } },
            );
          }
        }
        if (mapped[0]) setData(mapped[0]);
        setErrorDiagnostics(null);
        return mapped;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to scrape URLs";
        const cause = err instanceof Error ? err.cause : undefined;
        const failedIdx =
          cause &&
          typeof cause === "object" &&
          "failedResultIndex" in cause &&
          typeof (cause as { failedResultIndex: unknown }).failedResultIndex ===
            "number"
            ? (cause as { failedResultIndex: number }).failedResultIndex
            : undefined;
        const firstResult = ctx.partialRef.results[0] ?? null;
        if (firstResult) setRawData(firstResult);
        setErrorDiagnostics(
          makeScraperDiagnostics(
            "scrapeUrls",
            stage,
            err,
            snapshotReceived(
              ctx.streamEventLog,
              ctx.partialRef,
              ENDPOINTS.scraper.quickScrape,
              {
                requestedUrls: [...urls],
                failedResultIndex: failedIdx,
                http: httpSnapshot,
              },
            ),
          ),
        );
        setError(
          `${msg} — failed at useScraperApi.scrapeUrls → ${stage} (see errorDiagnostics)`,
        );
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [api, newSignal, onStatus],
  );

  // --------------------------------------------------------------------------
  // search — keyword search only, no scraping
  // --------------------------------------------------------------------------
  const search = useCallback(
    async (
      request: SearchKeywordsRequest,
    ): Promise<SearchResultItem[] | null> => {
      setIsLoading(true);
      setError(null);
      setErrorDiagnostics(null);
      setSearchResults([]);
      setSearchItems([]);
      setStatusMessage(null);

      const ctx = createStreamCtx();
      let stage: ScraperApiErrorDiagnostics["stage"] = "api.post";
      let httpSnapshot:
        ScraperApiErrorDiagnostics["received"]["http"] | undefined;

      try {
        const signal = newSignal();
        stage = "api.post";
        // Guests authenticate with a fingerprint that GlobalAuthSync resolves
        // ~100ms after mount. Anonymous surfaces (the public /seo tools) can
        // fire before that lands, so wait for an identity or the backend
        // rejects the call with auth_required.
        await api.waitForAuth();
        const response = await api.post(
          ENDPOINTS.scraper.search,
          request,
          signal,
        );
        httpSnapshot = captureHttpSnapshot(response);
        stage = "consumeScrapeStream";
        const { results } = await consumeScrapeStream(
          response,
          onStatus,
          ctx.streamEventLog,
          ctx.partialRef,
          signal,
        );

        stage = "normalize_search_results";
        // API returns flat items — each has keyword, title, url, description, etc.
        // Detect whether we got flat items or grouped { keyword, results: [] } objects.
        const items = results as unknown as SearchResultItem[];
        const isFlat = items.length > 0 && "title" in items[0];

        if (isFlat) {
          setSearchItems(items);
          const grouped: Record<string, SearchResultItem[]> = {};
          for (const item of items) {
            const kw = item.keyword ?? "results";
            (grouped[kw] ??= []).push(item);
          }
          const legacy: SearchResult[] = Object.entries(grouped).map(
            ([keyword, res]) => ({
              keyword,
              results: res,
              total_results: res.length,
            }),
          );
          setSearchResults(legacy);
          setErrorDiagnostics(null);
          return items;
        } else {
          const sr = results as unknown as SearchResult[];
          setSearchResults(sr);
          const flat = sr.flatMap((r) => r.results ?? []);
          setSearchItems(flat);
          setErrorDiagnostics(null);
          return flat;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Search failed";
        setErrorDiagnostics(
          makeScraperDiagnostics(
            "search",
            stage,
            err,
            snapshotReceived(
              ctx.streamEventLog,
              ctx.partialRef,
              ENDPOINTS.scraper.search,
              {
                requestPayload: request,
                http: httpSnapshot,
              },
            ),
          ),
        );
        setError(
          `${msg} — failed at useScraperApi.search → ${stage} (see errorDiagnostics)`,
        );
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [api, newSignal, onStatus],
  );

  // --------------------------------------------------------------------------
  // searchAndScrape — search keywords then scrape each result
  // --------------------------------------------------------------------------
  const searchAndScrape = useCallback(
    async (
      request: SearchAndScrapeRequest,
    ): Promise<ScraperResult[] | null> => {
      setIsLoading(true);
      setError(null);
      setErrorDiagnostics(null);
      setData(null);
      setStatusMessage(null);

      const ctx = createStreamCtx();
      let stage: ScraperApiErrorDiagnostics["stage"] = "api.post";
      let httpSnapshot:
        ScraperApiErrorDiagnostics["received"]["http"] | undefined;

      try {
        const signal = newSignal();
        stage = "api.post";
        // Guests authenticate with a fingerprint that GlobalAuthSync resolves
        // ~100ms after mount. Anonymous surfaces (the public /seo tools) can
        // fire before that lands, so wait for an identity or the backend
        // rejects the call with auth_required.
        await api.waitForAuth();
        const response = await api.post(
          ENDPOINTS.scraper.searchAndScrape,
          request,
          signal,
        );
        httpSnapshot = captureHttpSnapshot(response);
        stage = "consumeScrapeStream";
        const { results, metadata } = await consumeScrapeStream(
          response,
          onStatus,
          ctx.streamEventLog,
          ctx.partialRef,
          signal,
        );

        stage = "validate_nonempty_results";
        if (!results.length) throw new Error("No results returned");

        stage = "validate_result_success";
        assertAllRawScrapeRowsSucceeded(results, (i) => {
          const r = results[i];
          const u = (r.url as string) ?? `#${i}`;
          return u;
        });

        stage = "mapToScraperResult";
        const mapped: ScraperResult[] = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          try {
            mapped.push(
              mapToScraperResult(r, (r.url as string) ?? "", metadata),
            );
          } catch (mapErr) {
            throw new Error(
              `mapToScraperResult failed at index ${i} (${(r.url as string) ?? "?"}): ${extractErrorMessage(
                mapErr,
              )}`,
              { cause: { failedResultIndex: i } },
            );
          }
        }
        if (mapped[0]) setData(mapped[0]);
        setErrorDiagnostics(null);
        return mapped;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Search and scrape failed";
        const cause = err instanceof Error ? err.cause : undefined;
        const failedIdx =
          cause &&
          typeof cause === "object" &&
          "failedResultIndex" in cause &&
          typeof (cause as { failedResultIndex: unknown }).failedResultIndex ===
            "number"
            ? (cause as { failedResultIndex: number }).failedResultIndex
            : undefined;
        const firstResult = ctx.partialRef.results[0] ?? null;
        if (firstResult) setRawData(firstResult);
        setErrorDiagnostics(
          makeScraperDiagnostics(
            "searchAndScrape",
            stage,
            err,
            snapshotReceived(
              ctx.streamEventLog,
              ctx.partialRef,
              ENDPOINTS.scraper.searchAndScrape,
              {
                requestPayload: request,
                failedResultIndex: failedIdx,
                http: httpSnapshot,
              },
            ),
          ),
        );
        setError(
          `${msg} — failed at useScraperApi.searchAndScrape → ${stage} (see errorDiagnostics)`,
        );
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [api, newSignal, onStatus],
  );

  // --------------------------------------------------------------------------
  // searchAndScrapeLimited — single keyword, max N pages
  // --------------------------------------------------------------------------
  const searchAndScrapeLimited = useCallback(
    async (
      request: SearchAndScrapeLimitedRequest,
    ): Promise<ScraperResult[] | null> => {
      setIsLoading(true);
      setError(null);
      setErrorDiagnostics(null);
      setData(null);
      setStatusMessage(null);

      const ctx = createStreamCtx();
      let stage: ScraperApiErrorDiagnostics["stage"] = "api.post";
      let httpSnapshot:
        ScraperApiErrorDiagnostics["received"]["http"] | undefined;

      try {
        const signal = newSignal();
        stage = "api.post";
        // Guests authenticate with a fingerprint that GlobalAuthSync resolves
        // ~100ms after mount. Anonymous surfaces (the public /seo tools) can
        // fire before that lands, so wait for an identity or the backend
        // rejects the call with auth_required.
        await api.waitForAuth();
        const response = await api.post(
          ENDPOINTS.scraper.searchAndScrapeLimited,
          request,
          signal,
        );
        httpSnapshot = captureHttpSnapshot(response);
        stage = "consumeScrapeStream";
        const { results, metadata } = await consumeScrapeStream(
          response,
          onStatus,
          ctx.streamEventLog,
          ctx.partialRef,
          signal,
        );

        stage = "validate_nonempty_results";
        if (!results.length) throw new Error("No results returned");

        stage = "validate_result_success";
        assertAllRawScrapeRowsSucceeded(results, (i) => {
          const r = results[i];
          return (r.url as string) ?? `#${i}`;
        });

        stage = "mapToScraperResult";
        const mapped: ScraperResult[] = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          try {
            mapped.push(
              mapToScraperResult(r, (r.url as string) ?? "", metadata),
            );
          } catch (mapErr) {
            throw new Error(
              `mapToScraperResult failed at index ${i} (${(r.url as string) ?? "?"}): ${extractErrorMessage(
                mapErr,
              )}`,
              { cause: { failedResultIndex: i } },
            );
          }
        }
        if (mapped[0]) setData(mapped[0]);
        setErrorDiagnostics(null);
        return mapped;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Search and scrape limited failed";
        const cause = err instanceof Error ? err.cause : undefined;
        const failedIdx =
          cause &&
          typeof cause === "object" &&
          "failedResultIndex" in cause &&
          typeof (cause as { failedResultIndex: unknown }).failedResultIndex ===
            "number"
            ? (cause as { failedResultIndex: number }).failedResultIndex
            : undefined;
        const firstResult = ctx.partialRef.results[0] ?? null;
        if (firstResult) setRawData(firstResult);
        setErrorDiagnostics(
          makeScraperDiagnostics(
            "searchAndScrapeLimited",
            stage,
            err,
            snapshotReceived(
              ctx.streamEventLog,
              ctx.partialRef,
              ENDPOINTS.scraper.searchAndScrapeLimited,
              {
                requestPayload: request,
                failedResultIndex: failedIdx,
                http: httpSnapshot,
              },
            ),
          ),
        );
        setError(
          `${msg} — failed at useScraperApi.searchAndScrapeLimited → ${stage} (see errorDiagnostics)`,
        );
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [api, newSignal, onStatus],
  );

  // --------------------------------------------------------------------------
  // reset
  // --------------------------------------------------------------------------
  const reset = useCallback(() => {
    setData(null);
    setRawData(null);
    setSearchResults([]);
    setSearchItems([]);
    setError(null);
    setErrorDiagnostics(null);
    setStatusMessage(null);
    setIsLoading(false);
  }, []);

  return {
    data,
    rawData,
    searchResults,
    searchItems,
    isLoading,
    hasError: !!error,
    error,
    errorDiagnostics,
    statusMessage,
    scrapeUrl,
    scrapeUrlSilent,
    scrapeUrlRaw,
    scrapeUrls,
    search,
    searchAndScrape,
    searchAndScrapeLimited,
    cancel,
    reset,
  };
}
