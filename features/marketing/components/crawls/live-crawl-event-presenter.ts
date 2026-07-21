import type { CrawlLiveEvent } from "@/features/marketing/crawler/direct-client";

export interface PresentedCrawlEvent {
  label: string;
  message: string;
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
 * Converts the scraper wire event into a deliberately small display contract.
 * Error messages, exception classes, stacks, ORM queries/args, and warning
 * context are never copied into the primary user feed.
 */
export function presentLiveCrawlEvent(
  event: CrawlLiveEvent,
): PresentedCrawlEvent {
  switch (event.event_type) {
    case "crawl_session_created":
      return {
        label: "Session ready",
        message: "The crawler session is ready.",
      };
    case "crawl_started": {
      const url = eventUrl(event);
      return {
        label: "Crawl started",
        message: url ? `Starting with ${url}.` : "The crawl has started.",
      };
    }
    case "page_discovered":
      return {
        label: "Page discovered",
        message: `${pageSubject(event)} was added to the crawl queue.`,
      };
    case "url_classified":
      return {
        label: "URL reviewed",
        message: `${pageSubject(event)} was reviewed for crawl scope.`,
      };
    case "page_fetched": {
      const status = numberValue(event, "http_status");
      return {
        label: "Page fetched",
        message: `${pageSubject(event)}${status ? ` returned HTTP ${status}` : " was fetched"}.`,
      };
    }
    case "page_parsed":
      return {
        label: "Page analyzed",
        message: `${pageSubject(event)} was analyzed.`,
      };
    case "page_failed":
      return {
        label: event.will_retry === true ? "Page retrying" : "Page not fetched",
        message:
          event.will_retry === true
            ? `${pageSubject(event)} could not be fetched and will be retried.`
            : `${pageSubject(event)} could not be fetched.`,
      };
    case "crawl_progress":
      return {
        label: "Crawl progress",
        message: `${numberValue(event, "pages_fetched")} fetched · ${numberValue(event, "queue_depth")} queued · ${numberValue(event, "pages_failed")} not fetched`,
      };
    case "issue_detected":
      return {
        label: "Page issue found",
        message: `${pageSubject(event)} needs review.`,
      };
    case "crawl_warning":
      return {
        label: "Crawl notice",
        message: "The crawler encountered a recoverable issue and continued.",
      };
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
        message: `${numberValue(event, "pages_fetched")} fetched · ${numberValue(event, "pages_failed")} not fetched · ${numberValue(event, "issues_count")} issues`,
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
              : `The ${step} step started.`,
      };
    }
  }
}
