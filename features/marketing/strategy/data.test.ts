import { parseStrategyBrief, strategyPath } from "./data";

const row = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  scope: "site",
  brand_id: "brand-1",
  site_id: "site-1",
  status: "awaiting_review",
  brief_markdown: "# Hello",
  facts: { site_purpose: "Lead gen", open_questions: ["radius?"] },
  service_lines: [
    { name: "ITAD", customer_segment: "enterprise", footprint: "national" },
    { customer_segment: "no name — dropped" },
  ],
  agent_confidence: 4,
  confidence_reason: "solid crawl",
  guidance: "",
  auto_accept_at: "2026-09-15T00:00:00Z",
  inputs: { crawl: { pages: 983 }, gsc: null },
  version_no: 2,
  ...over,
});

describe("parseStrategyBrief", () => {
  it("reads the server row, camel-cased, and drops a nameless service line loudly-by-omission", () => {
    const brief = parseStrategyBrief(row());
    expect(brief).not.toBeNull();
    expect(brief?.scope).toBe("site");
    expect(brief?.serviceLines).toEqual([
      { name: "ITAD", customerSegment: "enterprise", footprint: "national", footprintDetail: "", why: "" },
    ]);
    expect(brief?.inputs).toEqual({ crawl: { pages: 983 }, gsc: null });
    expect(brief?.versionNo).toBe(2);
    expect(brief?.agentConfidence).toBe(4);
  });

  it("refuses a row with no id or an unknown scope rather than inventing one", () => {
    expect(parseStrategyBrief(row({ id: "" }))).toBeNull();
    expect(parseStrategyBrief(row({ scope: "org" }))).toBeNull();
    expect(parseStrategyBrief(null)).toBeNull();
  });

  it("treats a brand row's missing site_id as null, not empty string", () => {
    const brief = parseStrategyBrief(row({ scope: "brand", site_id: null }));
    expect(brief?.siteId).toBeNull();
  });
});

describe("strategyPath", () => {
  it("is ONE route family keyed by scope", () => {
    expect(strategyPath("brand")).toBe("/seo/brands/{brand_id}/strategy");
    expect(strategyPath("site")).toBe("/seo/sites/{site_id}/strategy");
  });
});
