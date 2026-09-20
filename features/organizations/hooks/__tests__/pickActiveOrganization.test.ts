/**
 * pickActiveOrganization.test.ts — BOOT MAY SELECT ONLY WHAT IT IS NOT
 * CHOOSING.
 *
 * Arman, 2026-09-19: a "default organization" is at most a per-client display
 * preference. Nothing but the org picker may read it, and nothing may pick an
 * organization for the user from a cookie, a saved preference, or their
 * personal workspace. Sole membership is the one exception, because there is
 * nothing to choose.
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * This file used to assert the OPPOSITE — that the recovery layer names the
 * personal org when memberships exist and no default is stated, and honours a
 * stated default over it. Those were the two rungs; they are deleted, and
 * these tests are the forcing function that stops them growing back. The
 * signature itself is the guard: `pickActiveOrganization` no longer ACCEPTS a
 * default-org id or a personal-org id, so a rung cannot be re-added here
 * without a caller change that `scripts/check-no-default-organization.ts` and
 * a reviewer both see.
 *
 * SUT: the real function the hook dispatches from.
 */

import { pickActiveOrganization } from "@/features/organizations/hooks/useActiveOrganizationAutoSelect";
import type { OrgNode } from "@/features/scopes/types";

const org = (id: string, name: string) => ({ id, name }) as unknown as OrgNode;

const PERSONAL = org("personal", "My workspace");
const A = org("a", "Client A");
const B = org("b", "Client B");

describe("pickActiveOrganization", () => {
  it("selects the only membership — nothing is being chosen for anybody", () => {
    expect(pickActiveOrganization([A])).toBe(A);
  });

  it("names nothing when there are several memberships, so the person is asked", () => {
    expect(pickActiveOrganization([A, B])).toBeNull();
  });

  it("does NOT reach for the personal workspace when several memberships exist", () => {
    // The deleted rung b. A person who belongs to their own workspace and two
    // clients has a real choice to make, and boot may not make it for them.
    expect(pickActiveOrganization([A, PERSONAL, B])).toBeNull();
  });

  it("takes no default-organization argument at all", () => {
    // The deleted rung a, enforced at the type level and at run time: extra
    // arguments are ignored, so a re-added preference rung cannot smuggle
    // itself in through this function.
    const withStrayArgs = pickActiveOrganization as unknown as (
      orgs: readonly OrgNode[],
      ...rest: unknown[]
    ) => OrgNode | null;
    expect(withStrayArgs([A, PERSONAL, B], "a", "personal")).toBeNull();
    expect(pickActiveOrganization.length).toBe(1);
  });

  it("names nothing when there are no memberships", () => {
    expect(pickActiveOrganization([])).toBeNull();
  });
});
