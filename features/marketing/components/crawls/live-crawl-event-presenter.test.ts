import type { CrawlLiveEvent } from "@/features/marketing/crawler/direct-client";
import {
  presentLiveCrawlEvent,
  summarizeLiveCrawlEvents,
} from "@/features/marketing/components/crawls/live-crawl-event-presenter";

function event(
  value: Partial<CrawlLiveEvent> & Pick<CrawlLiveEvent, "event_type">,
): CrawlLiveEvent {
  return { run_id: "run-1", ...value };
}

describe("presentLiveCrawlEvent", () => {
  it("never renders per-URL bookkeeping as feed rows", () => {
    // Discovery outpaces fetching ~50:1 on a real crawl; these events feed
    // the counters only. A row for any of them is a regression.
    expect(
      presentLiveCrawlEvent(
        event({
          event_type: "page_discovered",
          url: "https://example.com/a",
        }),
      ),
    ).toBeNull();
    expect(
      presentLiveCrawlEvent(
        event({
          event_type: "url_classified",
          url: "https://example.com/b",
          in_scope: true,
        }),
      ),
    ).toBeNull();
    expect(
      presentLiveCrawlEvent(
        event({ event_type: "page_parsed", url: "https://example.com/c" }),
      ),
    ).toBeNull();
  });

  it("never exposes ANSI ORM warning details, queries, args, or stacks", () => {
    const presented = presentLiveCrawlEvent(
      event({
        event_type: "crawl_warning",
        message:
          "\u001b[31mUnknownDatabaseError\u001b[0m query=SELECT * FROM secret args=['token']\nTraceback: stack",
        context: {
          query: "SELECT * FROM secret",
          args: ["token"],
          stack: "Traceback",
        },
      }),
    );

    expect(presented).toEqual({
      label: "Crawl notice",
      message: "The crawler encountered a recoverable issue and continued.",
      tone: "warning",
    });
    expect(JSON.stringify(presented)).not.toMatch(
      /\u001b|UnknownDatabaseError|SELECT|args|stack|token/i,
    );
  });

  it("uses only the safe page URL and retry state for page failures", () => {
    const presented = presentLiveCrawlEvent(
      event({
        event_type: "page_failed",
        url: "https://example.com/private?a=secret#debug",
        error_class: "UnknownDatabaseError",
        error_message:
          "\u001b[31mquery=INSERT INTO web.snapshot args=['secret']\u001b[0m",
        will_retry: true,
      }),
    );

    expect(presented).toEqual({
      label: "Page retrying",
      message:
        "https://example.com/private could not be fetched and will be retried.",
      tone: "warning",
    });
    expect(JSON.stringify(presented)).not.toMatch(
      /UnknownDatabaseError|query|args|secret|\u001b/i,
    );
  });

  it("summarizes failed completion without exposing the terminal error", () => {
    const presented = presentLiveCrawlEvent(
      event({
        event_type: "crawl_completed",
        status: "failed",
        pages_fetched: 7,
        pages_failed: 2,
        issues_count: 3,
        error_message:
          "UnknownDatabaseError: query=UPDATE web.page args=['private']",
      }),
    );

    expect(presented).toEqual({
      label: "Crawl stopped",
      message: "7 fetched · 2 failed · 3 issues",
      tone: "destructive",
    });
  });

  it("presents fetches with URL, status, and timing", () => {
    expect(
      presentLiveCrawlEvent(
        event({
          event_type: "page_fetched",
          url: "https://example.com/about",
          http_status: 200,
          fetch_ms: 412,
        }),
      ),
    ).toEqual({
      label: "Page fetched",
      message: "https://example.com/about · HTTP 200 · 412 ms",
      tone: "success",
    });
  });
});

describe("summarizeLiveCrawlEvents", () => {
  it("turns classification and discovery events into counters, not rows", () => {
    const counters = summarizeLiveCrawlEvents([
      event({ event_type: "crawl_started", url: "https://example.com/" }),
      event({ event_type: "page_discovered", url: "https://example.com/a" }),
      event({ event_type: "page_discovered", url: "https://example.com/b" }),
      event({ event_type: "page_discovered", url: "https://example.com/c" }),
      event({
        event_type: "url_classified",
        url: "https://example.com/a",
        in_scope: true,
      }),
      event({
        event_type: "url_classified",
        url: "https://cdn.example.com/x",
        in_scope: false,
      }),
      event({
        event_type: "page_fetched",
        url: "https://example.com/a",
        http_status: 200,
      }),
      event({
        event_type: "page_failed",
        url: "https://example.com/b",
        will_retry: false,
      }),
    ]);

    expect(counters).toEqual({
      discovered: 3,
      queued: 0,
      fetched: 1,
      failed: 1,
      skipped: 1,
      lastDiscoveredUrl: "https://example.com/c",
    });
  });

  it("prefers the scraper's own progress totals when reported", () => {
    const counters = summarizeLiveCrawlEvents([
      event({ event_type: "page_discovered", url: "https://example.com/a" }),
      event({
        event_type: "crawl_progress",
        pages_discovered: 240,
        pages_fetched: 12,
        pages_failed: 1,
        queue_depth: 227,
      }),
    ]);

    expect(counters.discovered).toBe(240);
    expect(counters.fetched).toBe(12);
    expect(counters.failed).toBe(1);
    expect(counters.queued).toBe(227);
  });

  it("counts string-decision skips as out of scope", () => {
    const counters = summarizeLiveCrawlEvents([
      event({
        event_type: "url_classified",
        url: "https://example.com/media.pdf",
        decision: "skipped_out_of_scope",
      }),
    ]);
    expect(counters.skipped).toBe(1);
  });
});
