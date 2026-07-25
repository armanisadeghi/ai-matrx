import {
  crawlerErrorMessage,
  crawlerCommandUrl,
  crawlEventFromStream,
  crawlLiveEventFromDurableRow,
  defaultCrawlOptions,
  mergeCrawlLiveEvents,
} from "@/features/marketing/crawler/direct-client";
import type { TypedStreamEvent } from "@/lib/api/types";
import { resolveServiceBaseUrl } from "@/lib/api/resolve-service-url";
import type { CrawlEvent } from "@/features/marketing/types";

jest.mock("@/lib/api/resolve-service-url", () => ({
  resolveServiceBaseUrl: jest.fn(),
}));

const mockedResolveServiceBaseUrl = jest.mocked(resolveServiceBaseUrl);

describe("direct marketing crawler transport", () => {
  afterEach(() => {
    mockedResolveServiceBaseUrl.mockReset();
  });

  it("builds commands against the standalone scraper origin", () => {
    mockedResolveServiceBaseUrl.mockReturnValue("https://scraper.example.test");
    expect(crawlerCommandUrl("sites/site-1/sessions")).toBe(
      "https://scraper.example.test/api/scraper/crawler/sites/site-1/sessions",
    );
    expect(mockedResolveServiceBaseUrl).toHaveBeenCalledWith("scraper");
  });

  it("defaults first-party crawls to ignore robots without removing the switch", () => {
    expect(defaultCrawlOptions.respect_robots).toBe(false);
    expect(Object.hasOwn(defaultCrawlOptions, "respect_robots")).toBe(true);
    expect(defaultCrawlOptions.capture_screenshots).toBe(true);
  });

  it("turns internal access failures into an actionable message", () => {
    expect(
      crawlerErrorMessage(500, "site editor access could not be verified"),
    ).toMatch(/ask a site admin/i);
  });

  it("turns readiness failures into a retryable message", () => {
    expect(crawlerErrorMessage(503, "web database unavailable")).toMatch(
      /temporarily unavailable/i,
    );
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

  it("restores canonical live events from durable crawl rows", () => {
    const row: CrawlEvent = {
      id: "event-1",
      organization_id: "org-1",
      created_at: "2026-07-25T03:00:00.000Z",
      updated_at: "2026-07-25T03:00:00.000Z",
      created_by: null,
      updated_by: null,
      deleted_at: null,
      version: 1,
      metadata: {},
      site_id: "site-1",
      session_id: "session-1",
      sequence: 42,
      event_type: "crawl_progress",
      phase: null,
      level: "info",
      message: null,
      page_id: null,
      crawl_url_id: null,
      payload: {
        event_type: "wrong_payload_value",
        run_id: "session-1",
        sequence: 999,
        pages_fetched: 12,
      },
      occurred_at: "2026-07-25T03:00:01.000Z",
    };

    expect(crawlLiveEventFromDurableRow(row)).toEqual(
      expect.objectContaining({
        event_type: "crawl_progress",
        run_id: "session-1",
        session_id: "session-1",
        site_id: "site-1",
        sequence: 42,
        pages_fetched: 12,
      }),
    );
  });

  it("deduplicates stream and durable replay by canonical sequence", () => {
    const durable = {
      event_type: "crawl_progress" as const,
      run_id: "session-1",
      sequence: 8,
      pages_fetched: 4,
    };
    const fresherStreamCopy = {
      ...durable,
      pages_fetched: 5,
    };

    expect(
      mergeCrawlLiveEvents(
        [durable],
        [fresherStreamCopy, { ...durable, sequence: 9 }],
      ),
    ).toEqual([fresherStreamCopy, { ...durable, sequence: 9 }]);
  });
});
