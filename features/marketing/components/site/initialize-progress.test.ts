import {
  initializeStepFromEvent,
  type CrawlLiveEvent,
} from "@/features/marketing/crawler/direct-client";
import {
  applyInitializeStepEvent,
  emptyInitializeSteps,
  queryKeysForInitializeStep,
} from "@/features/marketing/components/site/initialize-progress";
import { marketingKeys } from "@/features/marketing/data/hooks";

const liveEvent = (extra: Record<string, unknown>): CrawlLiveEvent =>
  ({
    event_type: "initialize_step",
    run_id: "run-1",
    ...extra,
  }) as CrawlLiveEvent;

describe("initializeStepFromEvent", () => {
  it("parses the documented granular contract", () => {
    expect(
      initializeStepFromEvent(
        liveEvent({ step: "identity", status: "complete" }),
      ),
    ).toEqual({
      step: "identity",
      status: "complete",
      count: null,
      message: null,
      errorType: null,
    });
  });

  it("carries counts from completion payloads", () => {
    expect(
      initializeStepFromEvent(
        liveEvent({ step: "screenshots", status: "complete", count: 4 }),
      )?.count,
    ).toBe(4);
    expect(
      initializeStepFromEvent(
        liveEvent({
          step: "sitemaps",
          status: "complete",
          counts: { found: 7, urls: 411 },
        }),
      )?.count,
    ).toBe(7);
  });

  it("carries failure messages", () => {
    const parsed = initializeStepFromEvent(
      liveEvent({
        step: "discovered",
        status: "failed",
        message: "robots blocked",
        error_type: "FetchError",
      }),
    );
    expect(parsed).toMatchObject({
      step: "discovered",
      status: "failed",
      message: "robots blocked",
      errorType: "FetchError",
    });
  });

  it("returns null for pre-contract streams and unknown shapes", () => {
    expect(initializeStepFromEvent(null)).toBeNull();
    expect(
      initializeStepFromEvent({
        event_type: "crawl_progress",
        run_id: "run-1",
      } as CrawlLiveEvent),
    ).toBeNull();
    expect(
      initializeStepFromEvent(liveEvent({ step: "bogus", status: "complete" })),
    ).toBeNull();
    expect(
      initializeStepFromEvent(liveEvent({ step: "identity", status: "meh" })),
    ).toBeNull();
  });
});

describe("applyInitializeStepEvent", () => {
  it("walks pending → running → done with count", () => {
    let state = emptyInitializeSteps();
    state = applyInitializeStepEvent(state, {
      step: "identity",
      status: "started",
      count: null,
      message: null,
      errorType: null,
    });
    expect(state.identity.status).toBe("running");
    expect(state.screenshots.status).toBe("pending");
    state = applyInitializeStepEvent(state, {
      step: "identity",
      status: "complete",
      count: 3,
      message: null,
      errorType: null,
    });
    expect(state.identity).toEqual({ status: "done", count: 3, message: null });
  });

  it("records failures with their message", () => {
    const state = applyInitializeStepEvent(emptyInitializeSteps(), {
      step: "sitemaps",
      status: "failed",
      count: null,
      message: "404 on robots.txt",
      errorType: null,
    });
    expect(state.sitemaps).toEqual({
      status: "failed",
      count: null,
      message: "404 on robots.txt",
    });
  });

  it("records prerequisite skips without turning them into failures", () => {
    const state = applyInitializeStepEvent(emptyInitializeSteps(), {
      step: "screenshots",
      status: "skipped",
      count: null,
      message: "Skipped because the homepage fetch failed.",
      errorType: null,
    });
    expect(state.screenshots).toEqual({
      status: "skipped",
      count: null,
      message: "Skipped because the homepage fetch failed.",
    });
  });
});

describe("queryKeysForInitializeStep — the event→invalidation map", () => {
  const siteId = "site-1";
  const brandId = "brand-1";

  it("identity invalidates ONLY the site row (exact), never the subtree", () => {
    expect(queryKeysForInitializeStep("identity", siteId, brandId)).toEqual([
      { queryKey: marketingKeys.site(siteId), exact: true },
    ]);
  });

  it("screenshots invalidate hero + gallery", () => {
    expect(queryKeysForInitializeStep("screenshots", siteId, brandId)).toEqual([
      { queryKey: marketingKeys.heroScreenshot(siteId), exact: false },
      {
        queryKey: [...marketingKeys.site(siteId), "page"] as const,
        exact: false,
      },
    ]);
  });

  it("sitemaps invalidate sitemap list, sitemap coverage, and the coverage matrix", () => {
    expect(
      queryKeysForInitializeStep("sitemaps", siteId, brandId).map(
        (entry) => entry.queryKey,
      ),
    ).toEqual([
      [...marketingKeys.site(siteId), "sitemaps"],
      [...marketingKeys.site(siteId), "sitemap-coverage"],
      [...marketingKeys.site(siteId), "coverage-matrix"],
    ]);
  });

  it("discovered invalidates the brand inbox lists and pending count", () => {
    expect(queryKeysForInitializeStep("discovered", siteId, brandId)).toEqual([
      {
        queryKey: [...marketingKeys.root, "brand", brandId, "discovered"],
        exact: false,
      },
      { queryKey: marketingKeys.discoveredCount(brandId), exact: false },
    ]);
    expect(queryKeysForInitializeStep("discovered", siteId, null)).toEqual([]);
  });
});
