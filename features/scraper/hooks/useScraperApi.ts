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

import type { components } from "@/types/python-generated/api-types";
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
import { captureScraperError } from "@/features/scraper/diagnostics/captureScraperError";
import {
  classifyScrapeFailure,
  type ScrapeFailure,
} from "@/features/scraper/failure/scrapeFailure";
import type {
  QuickScrapeRequest,
  SearchKeywordsRequest,
  SearchAndScrapeRequest,
  SearchAndScrapeLimitedRequest,
  ScrapedResult,
  ScrapeEngine,
  SearchResult,
  SearchResultItem,
} from "@/features/scraper/types/scraper-api";
import { asScrapeEngine, asContentWarning } from "@/features/scraper/types/scraper-api";
import type { ContentWarning } from "@/features/scraper/types/scraper-api";
import { readLadderOutcome } from "@/features/capture-ladder/ladderOutcome";
import type { LadderOutcome } from "@/features/capture-ladder/types";

/** Standalone scraper service mounts the package router below `/api`. */
export function scraperServiceEndpoint(endpoint: string): string {
  return endpoint.startsWith("/api/") ? endpoint : `/api${endpoint}`;
}

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
  /**
   * Which engine actually produced this content — `null` when the backend did
   * not say (every response older than 2026-09-17). Never guessed: a surface
   * shows the provenance line only when this is non-null.
   */
  engine: ScrapeEngine | null;
  /**
   * True when the plain HTTP fetch failed and the server browser was used
   * instead. `null` when the backend did not say.
   */
  escalated: boolean | null;
  /** The named reason we escalated (e.g. "cloudflare_block"), when given. */
  escalationReason: string | null;
  /**
   * The escalation reason already worded as a plain sentence — preferred over
   * `escalationSentence(escalationReason)` when the backend sent one. `null`
   * when the backend did not say (every response older than 2026-09-17, and
   * any row where `escalated` is not `true`).
   */
  escalationNote: string | null;
  /** Set only when this row succeeded but its content is suspect. */
  contentWarning: ContentWarning | null;
  /** Character count the backend computed directly, when it sent one. */
  contentChars: number | null;
  /** True when a configured proxy was skipped/bypassed for this row. */
  proxyBypassed: boolean | null;
  /**
   * THE CAPTURE LADDER's verdict on this row — which rungs ran, which one comes
   * next and why, or why nothing does. `null` when the backend said nothing
   * about the ladder at all, which is every response older than the ladder
   * build. See `features/capture-ladder/ladderOutcome.ts` and
   * `common-docs/projects/acquisition-frontier/extension-ladder/CONTRACT.md` §2.
   *
   * Never inferred from `escalated`/`escalationReason`: those describe rung 1 →
   * rung 2 only, and guessing the rest on the client is exactly how a rung gets
   * skipped.
   */
  ladder: LadderOutcome | null;
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

/**
 * One row of a batch (multi-URL) scrape — the shape the `/scraper/batch`
 * surface renders one table row from. Unlike `scrapeUrls`, a batch NEVER
 * throws on one bad URL and loses the rest: every row lands here, success or
 * failure, in arrival order.
 */
export interface BatchScrapeRow {
  url: string;
  success: boolean;
  result: ScraperResult | null;
  /** Plain-English reason, present only when `success` is false. Never a stack trace or raw JSON. */
  failureMessage: string | null;
  /**
   * The Source this page landed as (SOURCE-CONVERGENCE §4.1): every successful
   * scrape lands through the door at the route's result boundary and the page
   * payload carries its `processed_document_id`. `null` when it did not land —
   * `sourceNotices` then says why (or the server predates the door).
   */
  processedDocumentId: string | null;
  /** Every decision the door made about this page, in sentences — rendered, never dropped. */
  sourceNotices: BatchSourceNotice[];
}

/** The door's notice shape — the generated contract, never a mirror. */
export type BatchSourceNotice = components["schemas"]["LandingNotice"];

function readSourceLanding(raw: Record<string, unknown>): {
  processedDocumentId: string | null;
  sourceNotices: BatchSourceNotice[];
} {
  const id = raw.processed_document_id;
  const notices = Array.isArray(raw.notices) ? raw.notices : [];
  return {
    processedDocumentId: typeof id === "string" && id ? id : null,
    sourceNotices: notices.flatMap((n): BatchSourceNotice[] => {
      if (!n || typeof n !== "object") return [];
      const r = n as Record<string, unknown>;
      if (typeof r.message !== "string" || !r.message.trim()) return [];
      return [
        {
          code: typeof r.code === "string" ? r.code : "notice",
          message: r.message,
          remedy: typeof r.remedy === "string" ? r.remedy : "",
        },
      ];
    }),
  };
}

export interface UseScraperApiReturn extends ScraperApiState {
  /** Structured failure report (JSON-serializable). Only set when hasError. */
  errorDiagnostics: ScraperApiErrorDiagnostics | null;
  /**
   * THE USER-FACING FACE of the same failure: plain words + a remedy, with the
   * engineer string and the diagnostics carried along for a "Details"
   * disclosure. `error` above is the ENGINEER string (it names the hook, the
   * operation and the pipeline stage) — a surface a person looks at renders
   * this and `<ScrapeFailureNotice>`, never `error`. See
   * features/scraper/failure/scrapeFailure.ts.
   */
  failure: ScrapeFailure | null;
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
  /**
   * Batch scrape for a surface that renders one row per URL. ONE request
   * carries the whole list (the backend streams one envelope per page); a
   * bad row never aborts the others — `onRow` fires as each row lands, in
   * arrival order, whether it succeeded or failed. Never touches the shared
   * `data`/`error` state that `scrapeUrl` owns.
   */
  scrapeUrlsBatch: (
    urls: string[],
    onRow: (row: BatchScrapeRow) => void,
    options?: Partial<QuickScrapeRequest>,
  ) => Promise<BatchScrapeRow[]>;
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
  /**
   * Called with EXACTLY the rows newly appended by one `onData` event, in
   * arrival order — the batch surface's per-URL progress. A page that only
   * wants the final array (every other caller) leaves this unset.
   */
  onRowsAppended?: (newRows: Array<Record<string, unknown>>) => void,
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
        const previousCount = results.length;
        const extracted = extractResultsFromData(data, results, metadata);
        results = extracted.results;
        metadata = extracted.metadata;
        syncPartial();
        if (onRowsAppended && results.length > previousCount) {
          onRowsAppended(results.slice(previousCount));
        }
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
    // Provenance — read only what the backend actually sent. An absent or
    // unrecognized value stays null so the UI can say nothing rather than
    // claim an engine that never ran.
    engine: asScrapeEngine(raw.engine),
    escalated: typeof raw.escalated === "boolean" ? raw.escalated : null,
    escalationReason:
      typeof raw.escalation_reason === "string" && raw.escalation_reason.trim()
        ? raw.escalation_reason.trim()
        : null,
    escalationNote:
      typeof raw.escalation_note === "string" && raw.escalation_note.trim()
        ? raw.escalation_note.trim()
        : null,
    contentWarning: asContentWarning(raw.content_warning),
    contentChars:
      typeof raw.content_chars === "number" && Number.isFinite(raw.content_chars)
        ? raw.content_chars
        : null,
    proxyBypassed:
      typeof raw.proxy_bypassed === "boolean" ? raw.proxy_bypassed : null,
    ladder: readLadderOutcome(raw),
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useScraperApi(): UseScraperApiReturn {
  const api = useBackendApi("scraper");

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
        const endpoint = scraperServiceEndpoint(ENDPOINTS.scraper.quickScrape);
        const response = await api.post(endpoint, body, signal);
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
        const diagnostics = makeScraperDiagnostics(
          "scrapeUrl",
          stage,
          err,
          snapshotReceived(
            ctx.streamEventLog,
            ctx.partialRef,
            scraperServiceEndpoint(ENDPOINTS.scraper.quickScrape),
            { requestedUrl: url, http: httpSnapshot },
          ),
        );
        setErrorDiagnostics(diagnostics);
        captureScraperError(err, diagnostics);
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
        const response = await api.post(
          scraperServiceEndpoint(ENDPOINTS.scraper.quickScrape),
          body,
        );
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
          scraperServiceEndpoint(ENDPOINTS.scraper.quickScrape),
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

        const diagnostics = makeScraperDiagnostics(
          "scrapeUrlRaw",
          stage,
          err,
          snapshotReceived(
            streamEventLog,
            partialRef,
            scraperServiceEndpoint(ENDPOINTS.scraper.quickScrape),
            {
              requestedUrl: url,
              http: httpSnapshot,
            },
          ),
        );
        setErrorDiagnostics(diagnostics);
        captureScraperError(err, diagnostics);
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
          scraperServiceEndpoint(ENDPOINTS.scraper.quickScrape),
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
        const diagnostics = makeScraperDiagnostics(
          "scrapeUrls",
          stage,
          err,
          snapshotReceived(
            ctx.streamEventLog,
            ctx.partialRef,
            scraperServiceEndpoint(ENDPOINTS.scraper.quickScrape),
            {
              requestedUrls: [...urls],
              failedResultIndex: failedIdx,
              http: httpSnapshot,
            },
          ),
        );
        setErrorDiagnostics(diagnostics);
        captureScraperError(err, diagnostics);
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
  // scrapeUrlsBatch — one row per URL, streamed in, never abandons the batch
  // on one bad row. See BatchScrapeRow / UseScraperApiReturn.scrapeUrlsBatch.
  // --------------------------------------------------------------------------
  const scrapeUrlsBatch = useCallback(
    async (
      urls: string[],
      onRow: (row: BatchScrapeRow) => void,
      options: Partial<QuickScrapeRequest> = {},
    ): Promise<BatchScrapeRow[]> => {
      setIsLoading(true);
      setStatusMessage(null);

      const rows: BatchScrapeRow[] = [];
      const toRow = (raw: Record<string, unknown>): BatchScrapeRow => {
        const url =
          (raw.url as string) || (raw.response_url as string) || "";
        if (isRawScrapeRowFailed(raw)) {
          const failureMessage =
            typeof raw.failure_message === "string" &&
            (raw.failure_message as string).trim()
              ? (raw.failure_message as string).trim()
              : classifyScrapeFailure({
                  error: rawScrapeRowFailureMessage(raw),
                  diagnostics: null,
                }).title;
          return {
            url,
            success: false,
            result: null,
            failureMessage,
            processedDocumentId: null,
            sourceNotices: [],
          };
        }
        try {
          return {
            url,
            success: true,
            result: mapToScraperResult(raw, url, {}),
            failureMessage: null,
            ...readSourceLanding(raw),
          };
        } catch (mapErr) {
          return {
            url,
            success: false,
            result: null,
            failureMessage: classifyScrapeFailure({
              error: extractErrorMessage(mapErr),
              diagnostics: null,
            }).title,
            processedDocumentId: null,
            sourceNotices: [],
          };
        }
      };

      try {
        const signal = newSignal();
        const body: QuickScrapeRequest = {
          urls,
          use_cache: true,
          get_text_data: true,
          get_overview: true,
          get_links: true,
          get_main_image: true,
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
        const response = await api.post(
          scraperServiceEndpoint(ENDPOINTS.scraper.quickScrape),
          body,
          signal,
        );
        await consumeScrapeStream(
          response,
          onStatus,
          undefined,
          undefined,
          signal,
          (newRawRows) => {
            for (const raw of newRawRows) {
              const row = toRow(raw);
              rows.push(row);
              onRow(row);
            }
          },
        );
        return rows;
      } catch (err) {
        // The whole request failed before any row could be parsed (network
        // down, auth refused, stream truncated with zero rows) — every
        // requested URL becomes its own failed row rather than a page that
        // silently shows nothing.
        const failureMessage = classifyScrapeFailure({
          error: err,
          diagnostics: null,
        }).title;
        captureScraperError(
          err,
          makeScraperDiagnostics(
            "scrapeUrls",
            "api.post",
            err,
            snapshotReceived(
              [],
              { results: [], metadata: {} },
              scraperServiceEndpoint(ENDPOINTS.scraper.quickScrape),
              { requestedUrls: [...urls] },
            ),
          ),
        );
        const alreadyReported = new Set(rows.map((r) => r.url));
        for (const url of urls) {
          if (alreadyReported.has(url)) continue;
          const row: BatchScrapeRow = {
            url,
            success: false,
            result: null,
            failureMessage,
            processedDocumentId: null,
            sourceNotices: [],
          };
          rows.push(row);
          onRow(row);
        }
        return rows;
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
          scraperServiceEndpoint(ENDPOINTS.scraper.search),
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
        const diagnostics = makeScraperDiagnostics(
          "search",
          stage,
          err,
          snapshotReceived(
            ctx.streamEventLog,
            ctx.partialRef,
            scraperServiceEndpoint(ENDPOINTS.scraper.search),
            {
              requestPayload: request,
              http: httpSnapshot,
            },
          ),
        );
        setErrorDiagnostics(diagnostics);
        captureScraperError(err, diagnostics);
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
          scraperServiceEndpoint(ENDPOINTS.scraper.searchAndScrape),
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
        const diagnostics = makeScraperDiagnostics(
          "searchAndScrape",
          stage,
          err,
          snapshotReceived(
            ctx.streamEventLog,
            ctx.partialRef,
            scraperServiceEndpoint(ENDPOINTS.scraper.searchAndScrape),
            {
              requestPayload: request,
              failedResultIndex: failedIdx,
              http: httpSnapshot,
            },
          ),
        );
        setErrorDiagnostics(diagnostics);
        captureScraperError(err, diagnostics);
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
          scraperServiceEndpoint(ENDPOINTS.scraper.searchAndScrapeLimited),
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
        const diagnostics = makeScraperDiagnostics(
          "searchAndScrapeLimited",
          stage,
          err,
          snapshotReceived(
            ctx.streamEventLog,
            ctx.partialRef,
            scraperServiceEndpoint(ENDPOINTS.scraper.searchAndScrapeLimited),
            {
              requestPayload: request,
              failedResultIndex: failedIdx,
              http: httpSnapshot,
            },
          ),
        );
        setErrorDiagnostics(diagnostics);
        captureScraperError(err, diagnostics);
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
    // Derived on render, in ONE place, so EVERY operation and every failure
    // kind gets plain words — a new consumer cannot forget to build them.
    failure: error ? classifyScrapeFailure({ error, diagnostics: errorDiagnostics }) : null,
    statusMessage,
    scrapeUrl,
    scrapeUrlSilent,
    scrapeUrlRaw,
    scrapeUrls,
    scrapeUrlsBatch,
    search,
    searchAndScrape,
    searchAndScrapeLimited,
    cancel,
    reset,
  };
}
