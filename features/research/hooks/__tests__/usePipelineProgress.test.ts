import { sumCompletedAiCosts } from "../usePipelineProgress";
import { shouldRefreshTopicOverview } from "../../types";

describe("sumCompletedAiCosts", () => {
  it("sums only catalog-derived completion costs", () => {
    expect(
      sumCompletedAiCosts([
        { status: "success", metadata: { cost_usd: 0.0042 } },
        { status: "success", metadata: { cost_usd: 0.0018 } },
        { status: "failed", metadata: {} },
      ]),
    ).toBeCloseTo(0.006);
  });

  it("returns unknown when any successful operation has no priced usage", () => {
    expect(
      sumCompletedAiCosts([
        { status: "success", metadata: { cost_usd: 0.0042 } },
        { status: "success", metadata: { cost_usd: null } },
      ]),
    ).toBeNull();
  });

  it("reports zero before any AI operation completes", () => {
    expect(sumCompletedAiCosts([])).toBe(0);
  });
});

describe("shouldRefreshTopicOverview", () => {
  it.each([
    "search_sources_stored",
    "scrape_complete",
    "scrape_failed",
    "analysis_complete",
    "analysis_failed",
    "synthesis_complete",
    "synthesis_failed",
    "document_complete",
    "pipeline_complete",
  ] as const)(
    "refreshes lifetime counts after durable %s events",
    (eventType) => {
      expect(shouldRefreshTopicOverview(eventType)).toBe(true);
    },
  );

  it.each([
    "search_page_start",
    "scrape_start",
    "analysis_start",
    "synthesis_start",
    "authority_rank_batch",
  ] as const)(
    "does not query the overview for transient %s events",
    (eventType) => {
      expect(shouldRefreshTopicOverview(eventType)).toBe(false);
    },
  );
});
