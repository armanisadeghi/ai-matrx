/**
 * THE DOOR MUST HAVE AN ENTRANCE.
 *
 * The regression that produced this file (V-38, 2026-09-12):
 * `EmergencyDoorDialog` — the emergency door's request form, described in its
 * own header as "the one door UI on the platform" — shipped with **ZERO call
 * sites**. No route, page, menu or button mounted it. There was no screen in
 * the application on which any person could ask for emergency access, and the
 * whole `private` path was reachable only by calling the RPC by hand.
 *
 * It is the same defect HR shipped before it (`hrBreakGlass` with zero call
 * sites, `hrMeAccessLogHref` with no page), reproduced one layer up — which is
 * what makes it a CLASS rather than an accident, and why the guard is static
 * and structural rather than a render assertion.
 *
 * What this proves, and what it does not: it proves the chain
 * `AccessDenied → EmergencyDoorAffordance → EmergencyDoorDialog` exists in the
 * source and that the entrance sits on the screen where a person actually
 * meets the refusal. It cannot prove the affordance renders for a given
 * viewer — that is `iam.emergency_door_eligibility`'s answer at run time, and
 * it is proven against the live database instead.
 *
 * PROVEN FAILING FIRST: at `f942099a32` (the state V-38 tested) every
 * assertion below fails — `EmergencyDoorAffordance` does not exist and
 * `EmergencyDoorDialog` is named by nothing but itself.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..", "..");

function source(relative: string): string {
  return readFileSync(join(REPO, relative), "utf8");
}

/** THE one access-refusal screen. Every surface's refusal renders through it. */
const ACCESS_DENIED = "features/access-gate/components/AccessDenied.tsx";
const AFFORDANCE =
  "features/emergency-access/components/EmergencyDoorAffordance.tsx";

describe("the emergency door is reachable from the screen that refuses you", () => {
  it("mounts the door's entrance on the access-refusal screen", () => {
    const denied = source(ACCESS_DENIED);
    expect(denied).toContain("EmergencyDoorAffordance");
    expect(denied).toContain(
      "@/features/emergency-access/components/EmergencyDoorAffordance",
    );
    // It must be RENDERED, not merely imported — an unused import is exactly
    // the zero-call-site state this guard exists to catch.
    expect(denied).toMatch(/<EmergencyDoorAffordance\b/);
  });

  it("hands the entrance the record it is refusing", () => {
    const denied = source(ACCESS_DENIED);
    const mount = denied.slice(denied.indexOf("<EmergencyDoorAffordance"));
    // Without both of these the door cannot ask about anything.
    expect(mount).toMatch(/token=\{context\.entity\.token\}/);
    expect(mount).toMatch(/id=\{id\}/);
  });

  it("puts the entrance beside the ordinary request, never instead of it", () => {
    // Asking the owner is the normal path and stays the normal path for
    // everyone. Replacing it with the emergency door would push people through
    // an audited, notified, two-person door to do something routine.
    const denied = source(ACCESS_DENIED);
    expect(denied).toContain("<RequestAccessPanel");
    expect(denied.indexOf("<RequestAccessPanel")).toBeLessThan(
      denied.indexOf("<EmergencyDoorAffordance"),
    );
  });

  it("opens the ONE dialog rather than a second form", () => {
    const affordance = source(AFFORDANCE);
    expect(affordance).toContain("EmergencyDoorDialog");
    expect(affordance).toMatch(/<EmergencyDoorDialog\b/);
  });

  it("asks whether this person can get through before offering anything", () => {
    // A button that would only ever be refused is the dead control law 4
    // forbids. The affordance must consult the eligibility door, and must be
    // able to render nothing.
    const affordance = source(AFFORDANCE);
    expect(affordance).toContain("checkEmergencyDoorEligibility");
    expect(affordance).toMatch(/return null/);
  });
});
