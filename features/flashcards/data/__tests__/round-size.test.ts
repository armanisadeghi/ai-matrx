/**
 * Test / Write round size — the saved choice is clamped to the deck, "All"
 * (0) deals every card, the choices never offer a count the deck cannot fill,
 * and a round is a shuffled subset rather than the deck in set order.
 */

import {
  clampRoundSize,
  pickRound,
  ROUND_SIZE_ALL,
  roundSizeChoices,
  roundSizeValue,
} from "../roundSize";

describe("clampRoundSize", () => {
  it("deals the saved size when the deck is big enough", () => {
    expect(clampRoundSize(20, 39, 10)).toBe(20);
    expect(clampRoundSize(5, 39, 10)).toBe(5);
  });

  it("never deals more cards than the deck has", () => {
    expect(clampRoundSize(20, 7, 10)).toBe(7);
    expect(clampRoundSize(10, 0, 10)).toBe(0);
  });

  it("treats 0 as every card", () => {
    expect(clampRoundSize(ROUND_SIZE_ALL, 39, 10)).toBe(39);
  });

  it("falls back for a missing or invalid saved value", () => {
    expect(clampRoundSize(undefined, 39, 10)).toBe(10);
    expect(clampRoundSize(-3, 39, 20)).toBe(20);
    expect(clampRoundSize("12", 39, 20)).toBe(20);
  });
});

describe("roundSizeChoices", () => {
  it("offers every fixed size below the deck, then All", () => {
    expect(roundSizeChoices(39)).toEqual([5, 10, 20, ROUND_SIZE_ALL]);
    expect(roundSizeChoices(12)).toEqual([5, 10, ROUND_SIZE_ALL]);
  });

  it("offers nothing to pick for a tiny or empty deck", () => {
    expect(roundSizeChoices(5)).toEqual([ROUND_SIZE_ALL]);
    expect(roundSizeChoices(0)).toEqual([]);
  });

  it("saves a whole-deck round as All", () => {
    expect(roundSizeValue(39, 39)).toBe(ROUND_SIZE_ALL);
    expect(roundSizeValue(20, 39)).toBe(20);
  });
});

describe("pickRound", () => {
  const deck = Array.from({ length: 39 }, (_, i) => i);

  it("deals a subset of distinct cards from the deck", () => {
    const round = pickRound(deck, 10);
    expect(round).toHaveLength(10);
    expect(new Set(round).size).toBe(10);
    for (const c of round) expect(deck).toContain(c);
  });

  it("deals every card for All, not in set order every time", () => {
    const rounds = Array.from({ length: 5 }, () => pickRound(deck, 0));
    for (const r of rounds) expect([...r].sort((a, b) => a - b)).toEqual(deck);
    expect(rounds.some((r) => r.join() !== deck.join())).toBe(true);
  });
});
