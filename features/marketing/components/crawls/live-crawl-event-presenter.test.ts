import type { CrawlLiveEvent } from "@/features/marketing/crawler/direct-client";
import { presentLiveCrawlEvent } from "@/features/marketing/components/crawls/live-crawl-event-presenter";

function event(
  value: Partial<CrawlLiveEvent> & Pick<CrawlLiveEvent, "event_type">,
): CrawlLiveEvent {
  return { run_id: "run-1", ...value };
}

describe("presentLiveCrawlEvent", () => {
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
      message: "7 fetched · 2 not fetched · 3 issues",
    });
  });

  it("presents ordinary page events with concise labels", () => {
    expect(
      presentLiveCrawlEvent(
        event({
          event_type: "page_fetched",
          url: "https://example.com/about",
          http_status: 200,
        }),
      ),
    ).toEqual({
      label: "Page fetched",
      message: "https://example.com/about returned HTTP 200.",
    });
  });
});
