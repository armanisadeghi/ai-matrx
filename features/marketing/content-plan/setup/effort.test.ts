/**
 * The effort tier's rules, mirrored from aidream's
 * `services/content_plan/tests/test_cms_fill_steps.py`. Both sides must agree:
 * the FE decides what the button OFFERS and the server decides what it RUNS.
 */
import {
  coerceEffortTier,
  DEFAULT_EFFORT_TIER,
  EFFORT_TIERS,
  EFFORT_TIER_STEPS,
  readNodeEffortTier,
  readSiteEffortTier,
  resolveEffortTier,
  withNodeEffortTier,
} from "./effort";

describe("effort tiers", () => {
  it("every tier ends in the build step — cheap is shorter, never broken", () => {
    for (const tier of EFFORT_TIERS) {
      expect(EFFORT_TIER_STEPS[tier].at(-1)).toBe("p6_build");
    }
  });

  it("the cheapest tier is the one-shot authoring call", () => {
    expect(EFFORT_TIER_STEPS.quick).toEqual(["p6_build"]);
  });

  it("tiers get strictly more expensive", () => {
    const counts = EFFORT_TIERS.map((tier) => EFFORT_TIER_STEPS[tier].length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(new Set(counts).size).toBe(counts.length);
  });

  it("the default is today's whole pipeline, so nothing silently gets cheaper", () => {
    expect(EFFORT_TIER_STEPS[DEFAULT_EFFORT_TIER]).toEqual([
      "p3_family",
      "p4_write",
      "p5_review",
      "p6_build",
    ]);
  });

  it("a page override beats the run choice and the site default", () => {
    expect(
      resolveEffortTier({
        nodeMetadata: { effort_tier: "advanced" },
        requested: "quick",
        siteTier: "standard",
      }),
    ).toBe("advanced");
  });

  it("falls back site → platform default when a page says nothing", () => {
    expect(resolveEffortTier({ siteTier: "thorough" })).toBe("thorough");
    expect(resolveEffortTier({})).toBe(DEFAULT_EFFORT_TIER);
  });

  it("a garbage stored tier falls back instead of breaking a build", () => {
    expect(coerceEffortTier("luxury")).toBeNull();
    expect(readNodeEffortTier({ effort_tier: "luxury" })).toBeNull();
    expect(readSiteEffortTier({ content_plan: { effort_tier: 7 } })).toBeNull();
  });

  it("reads the site tier off the settings convention", () => {
    expect(readSiteEffortTier({ content_plan: { effort_tier: "quick" } })).toBe(
      "quick",
    );
    expect(readSiteEffortTier({})).toBeNull();
  });

  it("clearing a page override removes the key rather than storing a null", () => {
    expect(withNodeEffortTier({ effort_tier: "quick", other: 1 }, null)).toEqual({
      other: 1,
    });
  });
});
