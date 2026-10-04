// features/entitlements/__tests__/registry-holds-no-database-copies.test.ts
//
// INVARIANT: THE CLIENT REGISTRY HOLDS WORDS, NEVER A COPY OF THE DATABASE.
//
// `billing.capability` owns `enforced`, `min_tier` and `period` (USAGE-GATE.md
// rule 1; Arman 2026-10-03: nothing about tiers, points or limits is hardcoded).
// The registry used to repeat all three for every capability, and the client
// resolver decided from the copy: flipping `enforced` in the database changed
// nothing in the browser until someone also edited this file. The resolver RPCs
// (`entitlement_check`, `entitlement_snapshot`, `org_capability_status`) return
// enforced / required tier / period per capability — readers take them there.
//
// If this fails, do not widen the allowed set: read the value from the RPC.

import { ALL_CAPABILITIES, CAPABILITY_REGISTRY } from "../registry";

/** Presentation only: the words a surface shows, plus whose entitlement decides. */
const PRESENTATION_KEYS = new Set([
  "id",
  "label",
  "description",
  "scope",
  "upgradeMessage",
]);

describe("the capability registry holds no copy of billing.capability", () => {
  it("every entry carries presentation keys only", () => {
    const copied = ALL_CAPABILITIES.flatMap((c) =>
      Object.keys(CAPABILITY_REGISTRY[c])
        .filter((k) => !PRESENTATION_KEYS.has(k))
        .map((k) => `${c}.${k}`),
    );
    expect(copied).toEqual([]);
  });

  it("no entry repeats an enforcement flag, a tier or a metering period", () => {
    for (const c of ALL_CAPABILITIES) {
      const entry = CAPABILITY_REGISTRY[c] as unknown as Record<string, unknown>;
      expect([c, "enforced" in entry]).toEqual([c, false]);
      expect([c, "minTier" in entry]).toEqual([c, false]);
      expect([c, "period" in entry]).toEqual([c, false]);
    }
  });
});
