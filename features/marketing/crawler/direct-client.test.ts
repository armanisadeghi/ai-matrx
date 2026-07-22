import {
  crawlerErrorMessage,
  crawlerCommandUrl,
  crawlEventFromStream,
  defaultCrawlOptions,
} from "@/features/marketing/crawler/direct-client";
import type { TypedStreamEvent } from "@/lib/api/types";
import { resolveServiceBaseUrl } from "@/lib/api/resolve-service-url";

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
});
