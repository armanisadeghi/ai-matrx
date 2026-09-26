/**
 * pickActiveOrganization.test.ts — BOOT MAY SELECT ONLY WHAT IT IS NOT
 * CHOOSING.
 *
 * Arman, 2026-09-19: a "default organization" is at most a per-client display
 * preference. Nothing but the org picker may read it, and nothing may pick an
 * organization for the user from a cookie, a saved preference, or "the one
 * they created". Sole membership is the one exception, because there is
 * nothing to choose.
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * These tests are the forcing function that stops a picking rung growing
 * back. The signature itself is the guard: `pickActiveOrganization` ACCEPTS
 * no default-org id, so a rung cannot be re-added here
 * without a caller change that `scripts/check-no-default-organization.ts` and
 * a reviewer both see.
 *
 * SUT: the real function the hook dispatches from.
 */

import { pickActiveOrganization } from "@/features/organizations/hooks/useActiveOrganizationAutoSelect";
import type { OrgNode } from "@/features/scopes/types";

const org = (id: string, name: string) => ({ id, name }) as unknown as OrgNode;

const OWN = org("own", "The organization they created at signup");
const A = org("a", "Client A");
const B = org("b", "Client B");

describe("pickActiveOrganization", () => {
  it("selects the only membership — nothing is being chosen for anybody", () => {
    expect(pickActiveOrganization([A])).toBe(A);
  });

  it("names nothing when there are several memberships, so the person is asked", () => {
    expect(pickActiveOrganization([A, B])).toBeNull();
  });

  it("does NOT reach for the organization they created when several memberships exist", () => {
    // A person who belongs to their own organization and two clients has a
    // real choice to make, and boot may not make it for them.
    expect(pickActiveOrganization([A, OWN, B])).toBeNull();
  });

  it("takes no default-organization argument at all", () => {
    // The deleted rung a, enforced at the type level and at run time: extra
    // arguments are ignored, so a re-added preference rung cannot smuggle
    // itself in through this function.
    const withStrayArgs = pickActiveOrganization as unknown as (
      orgs: readonly OrgNode[],
      ...rest: unknown[]
    ) => OrgNode | null;
    expect(withStrayArgs([A, OWN, B], "a", "own")).toBeNull();
    expect(pickActiveOrganization.length).toBe(1);
  });

  it("names nothing when there are no memberships", () => {
    expect(pickActiveOrganization([])).toBeNull();
  });
});
