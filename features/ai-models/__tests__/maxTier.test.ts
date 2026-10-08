import {
  belongsInMaxTier,
  crossesMaxTier,
  intendedCostRating,
  matchesTierView,
  tierConfirmFor,
  tierMismatch,
} from "../maxTier";

const live = { is_deprecated: false, retired_at: null, pending_cost_rating: null };

describe("MAX tier rule", () => {
  it("names Arman's families", () => {
    for (const name of ["claude-mythos-5-1", "claude-fable-5", "gpt-6-astra", "claude-opus-5-max"])
      expect(belongsInMaxTier(name)).toBe(true);
    for (const name of ["claude-opus-5", "gpt-6.1-sol", "deep-research-max-preview-04-2026", "Qwen/Qwen3.7-Max"])
      expect(belongsInMaxTier(name)).toBe(false);
  });

  it("flags a live family member that is not rated 6", () => {
    expect(tierMismatch({ ...live, name: "claude-fable-5-max", cost_rating: 5 })).toBe("should-be-max");
    expect(tierMismatch({ ...live, name: "gpt-6-astra", cost_rating: null })).toBe("should-be-max");
    expect(tierMismatch({ ...live, name: "claude-sonnet-5-5-max", cost_rating: 4 })).toBe("should-be-max");
    expect(tierMismatch({ ...live, name: "claude-fable-5", cost_rating: 6 })).toBeNull();
  });

  it("flags a live rating-6 model outside the families unless its name says max", () => {
    expect(tierMismatch({ ...live, name: "claude-opus-5", cost_rating: 6 })).toBe("not-in-max-families");
    expect(tierMismatch({ ...live, name: "deep-research-max-preview-04-2026", cost_rating: 6 })).toBeNull();
  });

  it("never flags a non-Claude Max rated below 6", () => {
    expect(tierMismatch({ ...live, name: "Qwen/Qwen3.7-Max", cost_rating: 3 })).toBeNull();
    expect(tierMismatch({ ...live, name: "black-forest-labs/FLUX.2-max", cost_rating: 1 })).toBeNull();
    expect(tierMismatch({ ...live, name: "deep-research-max-preview-04-2026", cost_rating: 3 })).toBeNull();
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

  it("resolves the rating a save would write, whichever editor drives it", () => {
    const base = { rawJson: null, formRating: "", current: 5 };
    expect(intendedCostRating({ ...base, formRating: "6" })).toBe(6);
    expect(intendedCostRating(base)).toBeNull();
    expect(intendedCostRating({ ...base, rawJson: '{"cost_rating": 6}' })).toBe(6);
    expect(intendedCostRating({ ...base, rawJson: '{"cost_rating": null}' })).toBeNull();
    expect(intendedCostRating({ ...base, rawJson: '{"name": "x"}' })).toBe(5);
    expect(intendedCostRating({ ...base, rawJson: "{}", formRating: "3" })).toBe(3);
  });

  it("owes a confirm only when the save crosses the MAX line", () => {
    expect(tierConfirmFor({ rawJson: null, formRating: "6", current: 5 })).toEqual({ from: 5, to: 6 });
    expect(tierConfirmFor({ rawJson: null, formRating: "", current: 6 })).toEqual({ from: 6, to: null });
    expect(tierConfirmFor({ rawJson: '{"cost_rating": null}', formRating: "6", current: 6 })).toEqual({ from: 6, to: null });
    expect(tierConfirmFor({ rawJson: null, formRating: "4", current: 5 })).toBeNull();
    expect(tierConfirmFor({ rawJson: null, formRating: "6", current: 6 })).toBeNull();
  });
});
