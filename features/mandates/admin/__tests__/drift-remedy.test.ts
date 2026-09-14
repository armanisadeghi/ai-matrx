// "Latest" is the newest SAVED snapshot, never `agent.definition.version`.
//
// That column is an optimistic-concurrency counter that every write bumps,
// snapshot or not (CONTRACT Amendment 3b; R36 measured the "live ahead of
// saved" claim built from it FALSE on all four live rows; Quick Test Agent
// read counter 33 with newest snapshot 30, content-identical, 2026-09-14).
// This file used to pin the opposite belief (the "v8/v8-while-v9-exists" case
// read the counter as a version); the remedy no longer takes the counter at all.

import { resolveDriftRemedy } from "../mandate-health";

describe("resolveDriftRemedy", () => {
  it("newest is the newest SAVED snapshot; a pin equal to it has nothing to move to", () => {
    const remedy = resolveDriftRemedy(8, 8);
    expect(remedy.newestNumber).toBe(8);
    expect(remedy.newestSavedNumber).toBe(8);
    expect(remedy.pinUpdateHelps).toBe(false);
  });

  it("offers the pin update when a newer snapshot than the pin exists", () => {
    const remedy = resolveDriftRemedy(12, 8);
    expect(remedy.newestNumber).toBe(12);
    expect(remedy.pinUpdateHelps).toBe(true);
  });

  it("survives missing data without inventing a newest", () => {
    expect(resolveDriftRemedy(null, null).newestNumber).toBeNull();
    expect(resolveDriftRemedy(null, 3).pinUpdateHelps).toBe(false);
    expect(resolveDriftRemedy(3, null).pinUpdateHelps).toBe(false);
  });

  it("never accepts a counter: the signature has no third argument", () => {
    expect(resolveDriftRemedy.length).toBe(2);
  });
});
