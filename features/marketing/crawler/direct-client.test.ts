import {
  crawlerCommandUrl,
  crawlEventFromStream,
  defaultCrawlOptions,
} from "@/features/marketing/crawler/direct-client";
import type { TypedStreamEvent } from "@/lib/api/types";

describe("direct marketing crawler transport", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SCRAPER_URL;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SCRAPER_URL;
    } else {
      process.env.NEXT_PUBLIC_SCRAPER_URL = originalUrl;
    }
  });

  it("builds commands against the standalone scraper origin", () => {
    process.env.NEXT_PUBLIC_SCRAPER_URL = "https://scraper.example.test/";
    expect(crawlerCommandUrl("sites/site-1/sessions")).toBe(
      "https://scraper.example.test/api/scraper/crawler/sites/site-1/sessions",
    );
  });

  it("defaults first-party crawls to ignore robots without removing the switch", () => {
    expect(defaultCrawlOptions.respect_robots).toBe(false);
    expect(Object.hasOwn(defaultCrawlOptions, "respect_robots")).toBe(true);
    expect(defaultCrawlOptions.capture_screenshots).toBe(true);
  });

  it("extracts only canonical crawl data events", () => {
    const event = {
      event: "data",
      data: {
        event_type: "crawl_progress",
        run_id: "session-1",
        sequence: 3,
        pages_fetched: 2,
      },
    } as unknown as TypedStreamEvent;
    expect(crawlEventFromStream(event)).toMatchObject({
      event_type: "crawl_progress",
      run_id: "session-1",
      sequence: 3,
    });
    expect(
      crawlEventFromStream({
        event: "phase",
        data: { phase: "connected" },
      } as TypedStreamEvent),
    ).toBeNull();
  });
});
