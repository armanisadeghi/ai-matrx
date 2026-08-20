import {
  crawlPacingFromEvent,
  latestCrawlPacing,
  pacingSourceLabel,
} from "@/features/marketing/crawler/crawl-pacing";
import type { CrawlLiveEvent } from "@/features/marketing/crawler/direct-client";

function pacingEvent(overrides: Record<string, unknown> = {}): CrawlLiveEvent {
  return {
    event_type: "crawl_pacing",
    run_id: "run-1",
    host: "example.com",
    current_rps: 0.5,
    ceiling_rps: 12,
    discovered_ceiling_rps: null,
    source: "floor",
    platform: null,
    platform_display: null,
    fronted_by: null,
    crawl_delay_seconds: null,
    user_max_reduced: false,
    limit_hits: 0,
    notes: ["Nothing is known about this host yet."],
    reason: "plan_resolved",
    ...overrides,
  } as CrawlLiveEvent;
}

describe("crawlPacingFromEvent", () => {
  it("reads the wire shape the scraper emits", () => {
    const pacing = crawlPacingFromEvent(
      pacingEvent({
        current_rps: 2,
        ceiling_rps: 2,
        source: "platform_published",
        platform: "shopify",
        platform_display: "Shopify",
        fronted_by: "Cloudflare",
        user_max_reduced: true,
      }),
    );
    expect(pacing).not.toBeNull();
    expect(pacing?.currentRps).toBe(2);
    expect(pacing?.platformDisplay).toBe("Shopify");
    expect(pacing?.frontedBy).toBe("Cloudflare");
    expect(pacing?.userMaxReduced).toBe(true);
  });

  it("ignores events that are not pacing events", () => {
    expect(
      crawlPacingFromEvent({
        event_type: "crawl_progress",
        run_id: "run-1",
      } as CrawlLiveEvent),
    ).toBeNull();
  });

  it("rejects a pacing event missing the numbers it exists to carry", () => {
    expect(crawlPacingFromEvent(pacingEvent({ current_rps: "fast" }))).toBeNull();
  });

  it("keeps a not-yet-discovered ceiling as null, never as zero", () => {
    // "We have not found the limit" and "the limit is zero" are opposite facts.
    const pacing = crawlPacingFromEvent(pacingEvent());
    expect(pacing?.discoveredCeilingRps).toBeNull();
  });
});

describe("latestCrawlPacing", () => {
  it("returns the most recent pacing state, ignoring other events", () => {
    const pacing = latestCrawlPacing([
      pacingEvent({ current_rps: 0.5 }),
      { event_type: "crawl_progress", run_id: "run-1" } as CrawlLiveEvent,
      pacingEvent({ current_rps: 3.4, reason: "ramp_up" }),
    ]);
    expect(pacing?.currentRps).toBe(3.4);
  });

  it("is null when the crawl has reported no pacing yet", () => {
    expect(latestCrawlPacing([])).toBeNull();
  });
});

describe("pacingSourceLabel", () => {
  it.each([
    ["platform_published", "Shopify published limit"],
    ["remembered", "Learned from earlier crawls"],
    ["user_max", "Your configured maximum"],
    ["floor", "Discovering the limit"],
  ])("names the rule behind %s", (source, expected) => {
    const pacing = crawlPacingFromEvent(
      pacingEvent({ source, platform_display: "Shopify" }),
    );
    expect(pacing && pacingSourceLabel(pacing)).toBe(expected);
  });

  it("names the crawl-delay it is honouring", () => {
    const pacing = crawlPacingFromEvent(
      pacingEvent({ source: "robots_crawl_delay", crawl_delay_seconds: 10 }),
    );
    expect(pacing && pacingSourceLabel(pacing)).toBe(
      "robots.txt Crawl-delay 10s",
    );
  });
});
