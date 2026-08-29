// The v8/v8-while-v9-exists bug, pinned as a test.
//
// Live case (2026-08-29, `agent_factory.structure_builder`): master counter
// v9, saved snapshots v1..v8, pin at v8. The drift panel banner said "a newer
// version exists" while its split view said current v8 / newest v8, and its
// "Update to v8" button offered the version already pinned.

import { resolveDriftRemedy } from "../mandate-health";

describe("resolveDriftRemedy", () => {
  it("reports the live master as newest when it is ahead of every snapshot (the real agent_factory.structure_builder case)", () => {
    const remedy = resolveDriftRemedy(9, 8, 8);
    expect(remedy.newestNumber).toBe(9);
    expect(remedy.liveAheadOfSaved).toBe(true);
    // Pinning to the newest snapshot (v8) is the pin the mandate already has —
    // the panel must not offer it as the fix.
    expect(remedy.pinUpdateHelps).toBe(false);
  });

  it("offers the pin update when a newer snapshot than the pin exists", () => {
    const remedy = resolveDriftRemedy(12, 12, 8);
    expect(remedy.newestNumber).toBe(12);
    expect(remedy.liveAheadOfSaved).toBe(false);
    expect(remedy.pinUpdateHelps).toBe(true);
  });

  it("handles both facts at once: live ahead AND a newer snapshot than the pin", () => {
    const remedy = resolveDriftRemedy(10, 9, 8);
    expect(remedy.newestNumber).toBe(10);
    expect(remedy.liveAheadOfSaved).toBe(true);
    expect(remedy.pinUpdateHelps).toBe(true);
  });

  it("survives missing data", () => {
    expect(resolveDriftRemedy(null, null, null).newestNumber).toBeNull();
    expect(resolveDriftRemedy(3, null, null)).toMatchObject({
      newestNumber: 3,
      liveAheadOfSaved: true,
      pinUpdateHelps: false,
    });
  });
});
