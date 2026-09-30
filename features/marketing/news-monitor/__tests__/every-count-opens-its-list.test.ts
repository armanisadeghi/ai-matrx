/**
 * Acceptance 2026-09-29, defect 2: "Set aside … 78 (0 listed)", "Stale: 8" and
 * "Freshness unverified: 17" were plain text with only a tooltip. Every count
 * on the run view must open its actual list (NEWS-ENGINE-SPEC §7.5, "a count
 * alone is hiding").
 *
 * Guards: the run's recorded set-aside items (aidream
 * `CandidatesDiagnostics.set_aside_items`) reach every set-aside list with a
 * title and reason; every digest set-aside reason maps to a list that exists;
 * and an `?open=` link round-trips to the same list.
 */


import {
  openTargetParam,
  parseOpenTarget,
  readSetAside,
  setAsideListOf,
  type RunParts,
} from "../run-document";

function parts(diagnostics: Record<string, unknown>): RunParts {
  return {
    runId: "r",
    nodeId: "n",
    summary: { counts: { s2_dropped: { older_than_max_age: 2 } } },
    digest: null,
    report: null,
    triage: null,
    angleSets: [],
    verdicts: {},
    clientContext: null,
    withheld: [],
    diagnostics,
    rejected: [],
    preGated: [],
    notices: [],
    stages: [],
  };
}

// The shape the engine writes (real titles from All Green run 1def401a, 2026-09-29).
const DIAGNOSTICS = {
  s2_dropped: { older_than_max_age: 2 },
  below_floor: ["a0b6a2640a592962"],
  below_floor_by_lane: { profile_relevance_weak: 1 },
  over_limit: [],
  url_overlap_dropped: [],
  seen_skipped: [],
  set_aside_items: [
    { reason: "older_than_max_age", id: "i1", title: "Reusable E-commerce Packaging Market to Reach USD 24.04 Billion", urls: ["https://a.example/1"], detail: "published 2026-09-27T10:00:00Z" },
    { reason: "older_than_max_age", id: "i2", title: "Enva invests to tackle UK fridge mountain", urls: [], detail: "" },
    { reason: "below_floor", id: "a0b6a2640a592962", title: "Giorgio Armani's Heirs Must Sell 15% of His Empire", urls: [], detail: "lane profile_relevance_weak · queue 39.9" },
  ],
};

describe("every set-aside count opens its list", () => {
  it("lists dropped-before-scoring articles with their titles, not as counts only", () => {
    const s2 = readSetAside(parts(DIAGNOSTICS)).find((l) => l.id === "s2_dropped");
    expect(s2?.count).toBe(2);
    expect(s2?.listed).toBe(true);
    expect(s2?.items.map((i) => i.title)).toEqual([
      "Reusable E-commerce Packaging Market to Reach USD 24.04 Billion",
      "Enva invests to tackle UK fridge mountain",
    ]);
  });

  it("lists below-the-floor stories by headline, never as a bare id", () => {
    const below = readSetAside(parts(DIAGNOSTICS)).find((l) => l.id === "below_floor");
    expect(below?.items.map((i) => i.title)).toEqual(["Giorgio Armani's Heirs Must Sell 15% of His Empire"]);
    expect(below?.ids).toEqual([]);
  });

  it("maps every digest set-aside reason the engine writes to a list the run view has", () => {
    const listIds = new Set(readSetAside(parts(DIAGNOSTICS)).map((l) => l.id));
    // aidream engine/summary.py::_set_aside_counts reason keys
    for (const reason of [
      "withheld_hygiene",
      "withheld_safety",
      "older_than_max_age",
      "no_title_or_excerpt",
      "below_floor",
      "over_limit",
      "url_overlap",
      "seen_skipped",
      "coarse_rejected",
      "pre_gated_stale",
    ]) {
      const list = setAsideListOf(reason);
      expect({ reason, opens: list !== "all" && listIds.has(list) }).toEqual({ reason, opens: true });
    }
  });

  it("round-trips an ?open= link to the same list", () => {
    for (const target of [
      { kind: "surfaced" as const },
      { kind: "watch" as const, group: "stale" },
      { kind: "watch" as const, group: "unverified_no_corroboration" },
      { kind: "set_aside" as const, list: "below_floor" as const },
      { kind: "set_aside" as const, list: "all" as const },
    ]) {
      expect(parseOpenTarget(openTargetParam(target))).toEqual(target);
    }
  });
});
