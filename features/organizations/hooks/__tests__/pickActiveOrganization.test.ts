/**
 * pickActiveOrganization.test.ts — the RECOVERY layer applies the same rung
 * order as the primary resolver.
 *
 * The second layer used to require a stated default-org preference, exactly
 * like the primary path, so both declined together for the user in the
 * 2026-09-12 incident (many memberships, null defaultOrganizationId) and the
 * app sat forever with nothing selected. Recovery that shares the primary
 * path's blind spot is not a second layer at all.
 *
 * SUT: the real rung-order function the hook dispatches from.
 */

import { pickActiveOrganization } from "@/features/organizations/hooks/useActiveOrganizationAutoSelect";
import type { OrgNode } from "@/features/scopes/types";

const org = (id: string, name: string) => ({ id, name }) as unknown as OrgNode;

const PERSONAL = org("personal", "My workspace");
const A = org("a", "Client A");
const B = org("b", "Client B");

describe("pickActiveOrganization", () => {
  it("names the personal org when memberships exist and no default is stated", () => {
    expect(pickActiveOrganization([A, PERSONAL, B], null, "personal")).toBe(
      PERSONAL,
    );
  });

  it("a stated default outranks the personal org", () => {
    expect(pickActiveOrganization([A, PERSONAL], "a", "personal")).toBe(A);
  });

  it("falls to a sole membership when neither is known", () => {
    expect(pickActiveOrganization([A], null, null)).toBe(A);
  });

  it("names nothing when several memberships exist and none can be chosen", () => {
    expect(pickActiveOrganization([A, B], null, null)).toBeNull();
  });

  it("names nothing when there are no memberships at all", () => {
    expect(pickActiveOrganization([], "a", "personal")).toBeNull();
  });
});
