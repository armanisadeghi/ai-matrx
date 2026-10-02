/**
 * Match pair count — the learner's saved choice is clamped to the deck, and
 * the choices offered never include a count the deck cannot fill.
 */

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => null,
  useAppDispatch: () => jest.fn(),
}));

import {
  clampMatchPairCount,
  DEFAULT_MATCH_PAIR_COUNT,
  matchPairCountChoices,
} from "../useMatchGame";

describe("clampMatchPairCount", () => {
  it("deals the saved count when the deck is big enough", () => {
    expect(clampMatchPairCount(12, 39)).toBe(12);
    expect(clampMatchPairCount(4, 39)).toBe(4);
  });

  it("never deals more pairs than the deck has", () => {
    expect(clampMatchPairCount(12, 7)).toBe(7);
    expect(clampMatchPairCount(8, 3)).toBe(3);
    expect(clampMatchPairCount(8, 0)).toBe(0);
  });

  it("falls back to the default for a missing or invalid saved value", () => {
    expect(DEFAULT_MATCH_PAIR_COUNT).toBe(8);
    expect(clampMatchPairCount(undefined, 39)).toBe(8);
    expect(clampMatchPairCount("12", 39)).toBe(8);
    expect(clampMatchPairCount(0, 39)).toBe(8);
    expect(clampMatchPairCount(Number.NaN, 39)).toBe(8);
  });
});

describe("matchPairCountChoices", () => {
  it("offers every option for a large deck", () => {
    expect(matchPairCountChoices(39)).toEqual([4, 6, 8, 10, 12]);
    expect(matchPairCountChoices(13)).toEqual([4, 6, 8, 10, 12]);
  });

  it("caps the options at the deck size and offers the whole deck", () => {
    expect(matchPairCountChoices(7)).toEqual([4, 6, 7]);
    expect(matchPairCountChoices(8)).toEqual([4, 6, 8]);
    expect(matchPairCountChoices(12)).toEqual([4, 6, 8, 10, 12]);
  });

  it("offers a single choice (nothing to pick) for a tiny deck", () => {
    expect(matchPairCountChoices(3)).toEqual([3]);
    expect(matchPairCountChoices(0)).toEqual([]);
  });
});
