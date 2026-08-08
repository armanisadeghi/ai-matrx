import type { CrawlLiveEvent } from "@/features/marketing/crawler/direct-client";

export interface PresentedCrawlEvent {
  label: string;
  message: string;
  /** Failures and warnings render loud; milestones render default. */
  tone: "default" | "success" | "warning" | "destructive";
}

/**
 * Live counters derived from per-URL bookkeeping events. Discovery and
 * scope-classification events NEVER become feed rows (a real crawl discovers
 * URLs ~50x faster than it fetches them, and per-URL bookkeeping rows drown
 * the feed) — they only move these numbers.
 */
export interface LiveCrawlCounters {
  discovered: number;
  queued: number;
  fetched: number;
  failed: number;
  /** URLs classified out of crawl scope. */
  skipped: number;
  /** Most recently discovered URL — for an update-in-place ticker, never rows. */
  lastDiscoveredUrl: string | null;
}

function numberValue(event: CrawlLiveEvent, key: string): number {
  const value = event[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    // Live status should identify the page, not expose credentials, query
    // parameters, fragments, or arbitrary text carried by an error payload.
    const display = `${parsed.origin}${parsed.pathname}`;
    return display.length > 180 ? `${display.slice(0, 177)}...` : display;
  } catch {
    return null;
  }
}

function eventUrl(event: CrawlLiveEvent): string | null {
  const page = event.page;
  if (typeof page === "object" && page !== null && "url" in page) {
    const url = safeHttpUrl((page as { url?: unknown }).url);
    if (url) return url;
  }
  for (const key of [
    "url",
    "final_url",
    "normalized_url",
    "raw_url",
    "page_url",
    "base_url",
  ]) {
    const url = safeHttpUrl(event[key]);
    if (url) return url;
  }
  return null;
}

function pageSubject(event: CrawlLiveEvent): string {
  return eventUrl(event) ?? "A page";
}

/**
 * The scraper's human-authored warning text, trimmed for the feed. Messages
 * that look like stringified server errors (ANSI codes, ORM query/args dumps,
 * tracebacks, exception-class prefixes) return null so the caller falls back
 * to the generic notice - those details stay in the durable logs table.
 */
// eslint-disable-next-line no-control-regex -- ANSI escape detection needs the raw control char
const RAW_ERROR_DUMP = /\u001b|\bquery=|\bargs=|Traceback|^\s*\w*(Error|Exception)\b/;

function warningText(event: CrawlLiveEvent): string | null {
  const message = event.message;
  if (typeof message !== "string") return null;
  const trimmed = message.replace(/\s+/g, " ").trim();
  if (!trimmed || RAW_ERROR_DUMP.test(trimmed)) return null;
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
}

/** True when a url_classified event marks the URL out of crawl scope. */
function isOutOfScope(event: CrawlLiveEvent): boolean {
  for (const key of ["in_scope", "is_in_scope", "accepted", "allowed"]) {
    const value = event[key];
    if (typeof value === "boolean") return !value;
  }
  for (const key of ["decision", "classification", "action", "result"]) {
    const value = event[key];
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (
        normalized.includes("skip") ||
        normalized.includes("exclude") ||
        normalized.includes("out_of_scope") ||
        normalized.includes("rejected")
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Rolls per-URL bookkeeping events into the header counters. Prefers the
 * scraper's own progress totals when present and falls back to counting the
 * per-URL events themselves, so the numbers stay live between checkpoints.
 */
export function summarizeLiveCrawlEvents(
  events: CrawlLiveEvent[],
): LiveCrawlCounters {
  let discoveredEvents = 0;
  let fetchedEvents = 0;
  let failedEvents = 0;
  let skipped = 0;
  let lastDiscoveredUrl: string | null = null;
  let reportedDiscovered = 0;
  let reportedFetched = 0;
  let reportedFailed = 0;
  let queued = 0;
  let sawProgress = false;

  for (const event of events) {
    switch (event.event_type) {
      case "page_discovered": {
        discoveredEvents += 1;
        lastDiscoveredUrl = eventUrl(event) ?? lastDiscoveredUrl;
        break;
      }
      case "url_classified": {
        if (isOutOfScope(event)) skipped += 1;
        break;
      }
      case "page_fetched": {
        fetchedEvents += 1;
        break;
      }
      case "page_failed": {
        if (event.will_retry !== true) failedEvents += 1;
        break;
      }
      case "crawl_progress":
      case "crawl_completed": {
        sawProgress = true;
        reportedDiscovered = Math.max(
          reportedDiscovered,
          numberValue(event, "pages_discovered"),
        );
        reportedFetched = Math.max(
          reportedFetched,
          numberValue(event, "pages_fetched"),
        );
        reportedFailed = Math.max(
          reportedFailed,
          numberValue(event, "pages_failed"),
        );
        queued = numberValue(event, "queue_depth");
        break;
      }
      default:
        break;
    }
  }

  const discovered = Math.max(discoveredEvents, reportedDiscovered);
  const fetched = Math.max(fetchedEvents, reportedFetched);
  const failed = Math.max(failedEvents, reportedFailed);
  if (!sawProgress) {
    queued = Math.max(discovered - fetched - failed - skipped, 0);
  }
  return { discovered, queued, fetched, failed, skipped, lastDiscoveredUrl };
}

/**
 * Converts the scraper wire event into a deliberately small display contract.
 *
 * Returns `null` for per-URL bookkeeping (discovery, scope classification,
 * parse confirmations) — those events feed `summarizeLiveCrawlEvents` counters
 * only and MUST NOT produce feed rows. Rows are reserved for events a human
 * monitoring a crawl acts on: fetches, failures, warnings, and phase
 * milestones. Error messages, exception classes, stacks, ORM queries/args,
 * and warning context are never copied into the primary user feed.
 */
export function presentLiveCrawlEvent(
  event: CrawlLiveEvent,
): PresentedCrawlEvent | null {
  switch (event.event_type) {
    case "page_discovered":
    case "url_classified":
    case "urls_classified":
    case "page_captured":
    case "page_parsed":
      return null;
    case "crawl_session_created":
      return {
        label: "Session ready",
        message: "The crawler session is ready.",
        tone: "default",
      };
    case "crawl_started": {
      const url = eventUrl(event);
      return {
        label: "Crawl started",
        message: url ? `Starting with ${url}.` : "The crawl has started.",
        tone: "default",
      };
    }
    case "page_fetched": {
      const status = numberValue(event, "http_status");
      const ms =
        numberValue(event, "fetch_ms") || numberValue(event, "duration_ms");
      const parts = [
        status ? `HTTP ${status}` : "fetched",
        ms ? `${ms.toLocaleString()} ms` : null,
      ].filter(Boolean);
      return {
        label: "Page fetched",
        message: `${pageSubject(event)} · ${parts.join(" · ")}`,
        tone: "success",
      };
    }
    case "page_failed":
      return {
        label: event.will_retry === true ? "Page retrying" : "Page failed",
        message:
          event.will_retry === true
            ? `${pageSubject(event)} could not be fetched and will be retried.`
            : `${pageSubject(event)} could not be fetched.`,
        tone: event.will_retry === true ? "warning" : "destructive",
      };
    case "crawl_progress": {
      const fetched = numberValue(event, "pages_fetched");
      const queued = numberValue(event, "queue_depth");
      const failed = numberValue(event, "pages_failed");
      return {
        label: "Progress",
        message: `${fetched.toLocaleString()} page${fetched === 1 ? "" : "s"} scraped · ${queued.toLocaleString()} waiting${failed ? ` · ${failed.toLocaleString()} failed` : ""}`,
        tone: "default",
      };
    }
    case "issue_detected":
      return {
        label: "Page issue found",
        message: `${pageSubject(event)} needs review.`,
        tone: "warning",
      };
    case "crawl_warning": {
      // The scraper's own human-authored message (CrawlWarningEvent.message).
      // Discarding it for a fixed string made every notice meaningless — the
      // whole point of a warning row is saying WHAT happened.
      const detail = warningText(event);
      return {
        label: "Crawler notice",
        message: detail ?? "The crawler hit a recoverable issue and continued.",
        tone: "warning",
      };
    }
    case "crawl_completed": {
      const status = event.status;
      const label =
        status === "canceled"
          ? "Crawl canceled"
          : status === "failed"
            ? "Crawl stopped"
            : "Crawl completed";
      return {
        label,
        message: `${numberValue(event, "pages_fetched")} fetched · ${numberValue(event, "pages_failed")} failed · ${numberValue(event, "issues_count")} issues`,
        tone: status === "failed" ? "destructive" : "default",
      };
    }
    case "initialize_step": {
      const step = typeof event.step === "string" ? event.step : "step";
      const status = typeof event.status === "string" ? event.status : "";
      return {
        label: "Initialize step",
        message:
          status === "complete"
            ? `The ${step} step completed.`
            : status === "failed"
              ? `The ${step} step failed.`
              : status === "skipped"
                ? `The ${step} step was skipped because its prerequisite failed.`
                : `The ${step} step started.`,
        tone: status === "failed" ? "destructive" : "default",
      };
    }
  }
}
