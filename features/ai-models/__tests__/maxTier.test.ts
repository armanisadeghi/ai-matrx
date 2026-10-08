import {
  belongsInMaxTier,
  crossesMaxTier,
  matchesTierView,
  tierMismatch,
} from "../maxTier";

const live = { is_deprecated: false, retired_at: null, pending_cost_rating: null };

describe("MAX tier rule", () => {
  it("names Arman's families", () => {
    for (const name of ["claude-mythos-5-1", "claude-fable-5", "gpt-6-astra", "claude-opus-5-max"])
      expect(belongsInMaxTier(name)).toBe(true);
    for (const name of ["claude-opus-5", "gpt-6.1-sol", "deep-research-max-preview-04-2026"])
      expect(belongsInMaxTier(name)).toBe(false);
  });

  it("flags a family member that is not rated 6, and a live 6 outside the families", () => {
    expect(tierMismatch({ ...live, name: "claude-fable-5-max", cost_rating: 5 })).toBe("should-be-max");
    expect(tierMismatch({ ...live, name: "deep-research-max-preview-04-2026", cost_rating: 6 })).toBe(
      "not-in-max-families",
    );
    expect(tierMismatch({ ...live, name: "claude-fable-5", cost_rating: 6 })).toBeNull();
  });

  it("exempts retired models from the mismatch flag", () => {
    expect(tierMismatch({ ...live, is_deprecated: true, name: "claude-3-opus-20240229", cost_rating: 6 })).toBeNull();
  });

  it("filters the three views and detects crossing", () => {
    expect(matchesTierView({ ...live, name: "x", cost_rating: 6 }, "max")).toBe(true);
    expect(matchesTierView({ ...live, name: "x", cost_rating: 5 }, "max")).toBe(false);
    expect(matchesTierView({ ...live, name: "x", cost_rating: 5, pending_cost_rating: 6 }, "held")).toBe(true);
    expect(crossesMaxTier(5, 6)).toBe(true);
    expect(crossesMaxTier(6, null)).toBe(true);
    expect(crossesMaxTier(5, 4)).toBe(false);
    expect(crossesMaxTier(6, 6)).toBe(false);
  });
});
