/**
 * THE PER-ROW COVERAGE BADGE's rules.
 *
 * Every case here is a way to tell the user something false:
 *  - a badge that disappears when the report FAILED reads as "assigned";
 *  - a badge that treats a key missing from an ORG-scoped report as green
 *    claims that organization answers for a mandate it does not own;
 *  - an amber badge that does not name the leader is exactly the silent
 *    permanent mediocrity FALLBACK-MANDATES.md exists to prevent;
 *  - narrowing to a bucket with no mandates in it must show an EMPTY list,
 *    not the whole registry.
 */

import {
  buildCoverageStateIndex,
  coverageKeysInBucket,
  type MandateCoverageStatesResponse,
} from "../../coverage";
import {
  coverageBadgeVerdict,
  type MandateCoverageView,
} from "../CoverageBadge";
import { withCoverageKeys } from "../service";

const REPORT: MandateCoverageStatesResponse = {
  organization_id: null,
  computed_at: "2026-08-29T00:00:00Z",
  counts: { green: 1, orange: 1, red: 1 },
  states: [
    {
      mandate_key: "ambient.page_guidance",
      state: "green",
      leader_key: null,
      reason: null,
    },
    {
      mandate_key: "education.page_guidance",
      state: "orange",
      leader_key: "ambient.page_guidance",
      reason:
        "education.page_guidance has no holder of its own — it runs on ambient.page_guidance's holder.",
    },
    {
      mandate_key: "research.page_summary",
      state: "red",
      leader_key: null,
      reason: "research.page_summary has no explicit holder and names no fallback.",
    },
  ],
};

function view(overrides: Partial<MandateCoverageView> = {}): MandateCoverageView {
  return {
    report: REPORT,
    states: buildCoverageStateIndex(REPORT),
    loading: false,
    error: null,
    scoped: false,
    active: null,
    onToggleFilter: () => {},
    ...overrides,
  };
}

describe("coverageBadgeVerdict", () => {
  it("is quiet on a met mandate", () => {
    expect(coverageBadgeVerdict(view(), "ambient.page_guidance")).toEqual({
      kind: "none",
    });
  });

  it("names the leader on an amber row when there is room for it", () => {
    const verdict = coverageBadgeVerdict(
      view(),
      "education.page_guidance",
      true,
    );
    expect(verdict.kind).toBe("state");
    if (verdict.kind !== "state") throw new Error("unreachable");
    expect(verdict.bucket).toBe("orange");
    expect(verdict.label).toBe("ambient.page_guidance");
    expect(verdict.title).toContain("runs on ambient.page_guidance");
  });

  it("still says fallback, and carries the leader in the tooltip, when tight", () => {
    const verdict = coverageBadgeVerdict(view(), "education.page_guidance");
    if (verdict.kind !== "state") throw new Error("expected a state badge");
    expect(verdict.label).toBe("Fallback");
    expect(verdict.title).toContain("ambient.page_guidance");
  });

  it("says Unassigned in red when nothing resolves", () => {
    const verdict = coverageBadgeVerdict(view(), "research.page_summary");
    if (verdict.kind !== "state") throw new Error("expected a state badge");
    expect(verdict.bucket).toBe("red");
    expect(verdict.label).toBe("Unassigned");
  });

  it("says UNKNOWN — never nothing — when the report failed", () => {
    const verdict = coverageBadgeVerdict(
      view({ error: "503 from aidream" }),
      "ambient.page_guidance",
    );
    expect(verdict.kind).toBe("unknown");
    if (verdict.kind !== "unknown") throw new Error("unreachable");
    expect(verdict.title).toContain("503 from aidream");
  });

  it("marks a mandate an ORG-scoped report does not cover as unanswered", () => {
    expect(
      coverageBadgeVerdict(view({ scoped: true }), "platform.something_else"),
    ).toEqual({ kind: "unanswered" });
  });

  it("stays quiet for an absent key when the report covers everything", () => {
    expect(
      coverageBadgeVerdict(view(), "platform.something_else").kind,
    ).toBe("none");
  });

  it("offers to clear the filter it is already applying", () => {
    const verdict = coverageBadgeVerdict(
      view({ active: "orange" }),
      "education.page_guidance",
    );
    if (verdict.kind !== "state") throw new Error("expected a state badge");
    expect(verdict.title).toContain("clear this filter");
  });
});

describe("coverage narrowing", () => {
  it("sends the keys the SERVER classified, never a rule", () => {
    expect(coverageKeysInBucket(REPORT, "orange")).toEqual([
      "education.page_guidance",
    ]);
    expect(coverageKeysInBucket(REPORT, "green")).toEqual([
      "ambient.page_guidance",
    ]);
  });

  it("adds coverage_keys to the RPC filter bag without disturbing the rest", () => {
    const filters = withCoverageKeys(
      { feature: { kind: "select", values: ["education"] } },
      { bucket: "orange", keys: coverageKeysInBucket(REPORT, "orange") },
    ) as Record<string, { kind: string; values: string[] }>;
    expect(filters.feature.values).toEqual(["education"]);
    expect(filters.coverage_keys.values).toEqual(["education.page_guidance"]);
  });

  it("matches NOTHING when the bucket is empty, rather than everything", () => {
    const filters = withCoverageKeys({}, { bucket: "red", keys: [] }) as Record<
      string,
      { values: string[] }
    >;
    expect(filters.coverage_keys.values).toHaveLength(1);
    expect(filters.coverage_keys.values[0]).not.toContain(".");
  });

  it("leaves the filter bag alone when nothing is narrowed", () => {
    expect(withCoverageKeys({ label: { kind: "text", value: "x" } }, null)).toEqual({
      label: { kind: "text", value: "x" },
    });
  });
});
