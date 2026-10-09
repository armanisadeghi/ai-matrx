/**
 * The list's Inputs column is red exactly when the relevance check judges with
 * nothing to judge against (2026-10-08: "AI Matrx brand coverage" ran with 0
 * topics, no brief and a 34-character description). Rows come from the real
 * door shape (`toTrackerInputs`), so a renamed column fails here.
 */
import { isDisposableTracker, toTrackerInputs, trackerReadiness } from "./data";

const base = {
  id: "5282ac85-301f-461f-b8c9-d30063853752",
  name: "AI Matrx brand coverage",
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  organization_name: "AI Matrx",
  brand_id: "b1",
  brand_name: "AI Matrx",
  site_id: null,
  is_active: true,
  auto_run_paused_at: "2026-10-08 14:10:02+00",
  auto_run_paused_reason: "cost",
  deleted_at: null,
  is_fixture: false,
  lenses: ["coverage"],
  topics: [],
  search_terms: [],
  exclude_terms: [],
  brief_source_id: null,
  brief_text: null,
  brief_is_empty: true,
  competitor_names: ["zapier", "n8n"],
  brand_description: "AI Matrx builds no-code AI systems.",
  facts: [{ id: "f1", kind: "spokesperson", text: "Arman Sadeghi", title: "CEO" }],
  runs_30d: 0,
  cost_30d_usd: "0",
  last_run_at: null,
  last_run_status: null,
};

describe("news tracker readiness", () => {
  it("is red for the tracker that ran with no topics and no brief", () => {
    const row = toTrackerInputs(base);
    expect(row.readiness).toBe("missing");
    expect(row.gaps).toEqual(["No topics", "No brief", "Short brand description"]);
    expect(row.status).toBe("paused");
    expect(row.facts[0]).toMatchObject({ kind: "spokesperson", text: "Arman Sadeghi", title: "CEO" });
  });

  it("is amber when topics and brief exist but the company picture is thin", () => {
    expect(
      trackerReadiness({ topics: 7, briefIsEmpty: false, descriptionChars: 0, competitors: 0, facts: 34 }),
    ).toEqual({ readiness: "thin", gaps: ["No brand description", "No competitors"] });
  });

  it("is green only when every input is filled", () => {
    expect(
      trackerReadiness({ topics: 3, briefIsEmpty: false, descriptionChars: 200, competitors: 2, facts: 4 }).readiness,
    ).toBe("ready");
  });

  it("flags disposable and fixture trackers, not real ones", () => {
    expect(isDisposableTracker("[disposable] acceptance — All Green", false)).toBe(true);
    expect(isDisposableTracker("Lane F test 11 — Anthropic coverage (disposable)", false)).toBe(true);
    expect(isDisposableTracker("AI Matrx brand coverage", true)).toBe(true);
    expect(isDisposableTracker("AI Matrx brand coverage", false)).toBe(false);
  });

  it("reads an archived row as archived even when it is still active", () => {
    expect(toTrackerInputs({ ...base, deleted_at: "2026-10-08T00:00:00Z" }).status).toBe("archived");
  });
});
