/**
 * THE live "N fetched" count (2026-09-14: the header badge sat at "0 fetched"
 * while the live feed showed pages landing). `stats.pages_fetched` counts pages
 * whose capture is fully persisted — it trails the network fetch by minutes on a
 * screenshot crawl. The live count is the responses received
 * (`stats.pages_downloaded`, written on every progress heartbeat).
 */
import { liveFetchedCount } from "@/features/marketing/crawler/crawl-counts";
import { summarizeLiveCrawlEvents } from "@/features/marketing/components/crawls/live-crawl-event-presenter";
import type { CrawlLiveEvent } from "@/features/marketing/crawler/direct-client";

describe("liveFetchedCount", () => {
  it("counts responses received while captures are still persisting", () => {
    // The real 2026-09-14 heartbeat shape two minutes into the aireserv crawl.
    expect(
      liveFetchedCount({ pages_fetched: 0, pages_downloaded: 5, pages_in_flight: 5 }),
    ).toBe(5);
  });

  it("never reads below the captured count", () => {
    expect(liveFetchedCount({ pages_fetched: 25 })).toBe(25);
    expect(liveFetchedCount({ pages_fetched: 25, pages_downloaded: 24 })).toBe(25);
  });

  it("is zero for an empty or malformed stats object", () => {
    expect(liveFetchedCount({})).toBe(0);
    expect(liveFetchedCount(null)).toBe(0);
    expect(liveFetchedCount({ pages_downloaded: "7" })).toBe(0);
  });

  it("agrees with the live feed's counter for the same heartbeat", () => {
    const heartbeat = {
      event_type: "crawl_progress",
      pages_discovered: 26,
      pages_fetched: 0,
      pages_downloaded: 5,
      pages_failed: 0,
      queue_depth: 21,
    } as unknown as CrawlLiveEvent;
    expect(summarizeLiveCrawlEvents([heartbeat]).fetched).toBe(
      liveFetchedCount(heartbeat as unknown as Record<string, number>),
    );
  });
});
