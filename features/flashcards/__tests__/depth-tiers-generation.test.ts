// WP3 gap 8 (VISION §1 — "every AI generation path supports tiered depth").
// These pin the fold that carries the tier to the generation agents through
// their declared free-text variables: the directive must lead, the learner's
// own request must survive verbatim, and no tier must mean no change.

import {
  DEPTH_DIRECTIVES,
  DEPTH_TIERS,
  foldDepthIntoRequest,
} from "../data/enhanceCard";

describe("generation-time depth tiers", () => {
  test("every tier has a directive, and every directive names its tier", () => {
    for (const tier of DEPTH_TIERS) {
      const directive = DEPTH_DIRECTIVES[tier.value];
      expect(directive).toBeTruthy();
      expect(directive.toLowerCase()).toContain("depth tier");
    }
  });

  test("depth alone becomes the directive", () => {
    expect(foldDepthIntoRequest("exam")).toBe(DEPTH_DIRECTIVES.exam);
  });

  test("the learner's own request survives verbatim, after the directive", () => {
    const folded = foldDepthIntoRequest("applied", "focus on key dates");
    expect(folded).toBe(`${DEPTH_DIRECTIVES.applied}\n\nfocus on key dates`);
  });

  test("no depth leaves the request untouched", () => {
    expect(foldDepthIntoRequest(undefined, "focus on key dates")).toBe(
      "focus on key dates",
    );
    expect(foldDepthIntoRequest(undefined, "   ")).toBeUndefined();
    expect(foldDepthIntoRequest(undefined)).toBeUndefined();
  });

  test("whitespace-only learner input does not orphan a stray separator", () => {
    expect(foldDepthIntoRequest("recall", "  ")).toBe(DEPTH_DIRECTIVES.recall);
  });
});
