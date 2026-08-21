// Collapse-on-mastery queue resolution (FastFire spec 26a, Q15 #4) — forcing
// tests. These pass only if mastered sub-cards fold OUT while their parent
// folds back IN, an active sub-card keeps drilling while its parent steps
// aside, learner overrides beat the auto rule in both directions, and a deck
// with no expansion graph passes through untouched.

import {
  COLLAPSE_MIN_MASTERY,
  COLLAPSE_MIN_STREAK,
  isEffectivelyCollapsed,
  resolveQueue,
} from "../collapse";
import type { ItemMasteryRow } from "@/features/education/study/types";

function mastery(over: Partial<ItemMasteryRow>): ItemMasteryRow {
  return {
    collapse_state: "auto",
    streak: 0,
    mastery_score: 0,
    ...over,
  } as ItemMasteryRow;
}

const card = (id: string) => ({ id });

describe("isEffectivelyCollapsed", () => {
  it("auto: collapses only past BOTH thresholds", () => {
    expect(
      isEffectivelyCollapsed(
        mastery({ streak: COLLAPSE_MIN_STREAK, mastery_score: COLLAPSE_MIN_MASTERY }),
      ),
    ).toBe(true);
    expect(
      isEffectivelyCollapsed(
        mastery({ streak: COLLAPSE_MIN_STREAK - 1, mastery_score: 1 }),
      ),
    ).toBe(false);
    expect(
      isEffectivelyCollapsed(
        mastery({ streak: 10, mastery_score: COLLAPSE_MIN_MASTERY - 0.01 }),
      ),
    ).toBe(false);
  });

  it("no mastery row = never collapsed", () => {
    expect(isEffectivelyCollapsed(undefined)).toBe(false);
  });

  it("learner overrides beat auto in both directions", () => {
    expect(
      isEffectivelyCollapsed(
        mastery({ collapse_state: "collapsed", streak: 0, mastery_score: 0 }),
      ),
    ).toBe(true);
    expect(
      isEffectivelyCollapsed(
        mastery({ collapse_state: "expanded", streak: 9, mastery_score: 1 }),
      ),
    ).toBe(false);
  });
});

describe("resolveQueue", () => {
  const deck = [card("parent"), card("c1"), card("c2"), card("plain")];
  const edges = { parent: ["c1", "c2"] };

  it("no expansion graph → untouched", () => {
    const r = resolveQueue(deck, {}, {});
    expect(r.queue.map((c) => c.id)).toEqual(["parent", "c1", "c2", "plain"]);
    expect(r.foldedChildIds).toEqual([]);
  });

  it("active sub-cards drill; the parent steps aside", () => {
    const r = resolveQueue(deck, edges, {});
    expect(r.queue.map((c) => c.id)).toEqual(["c1", "c2", "plain"]);
    expect(r.deferredParentIds).toEqual(["parent"]);
  });

  it("one mastered child folds out; the other keeps the parent aside", () => {
    const r = resolveQueue(deck, edges, {
      c1: mastery({ streak: 5, mastery_score: 0.95 }),
    });
    expect(r.queue.map((c) => c.id)).toEqual(["c2", "plain"]);
    expect(r.foldedChildIds).toEqual(["c1"]);
  });

  it("all children mastered → concept collapses back into the parent", () => {
    const done = mastery({ streak: 5, mastery_score: 0.95 });
    const r = resolveQueue(deck, edges, { c1: done, c2: done });
    expect(r.queue.map((c) => c.id)).toEqual(["parent", "plain"]);
    expect(r.foldedChildIds.sort()).toEqual(["c1", "c2"]);
  });

  it("children in the deck without their parent still fold when mastered", () => {
    const done = mastery({ streak: 5, mastery_score: 0.95 });
    const noParent = [card("c1"), card("c2"), card("plain")];
    const r = resolveQueue(noParent, edges, { c1: done, c2: done });
    expect(r.queue.map((c) => c.id)).toEqual(["plain"]);
  });
});
