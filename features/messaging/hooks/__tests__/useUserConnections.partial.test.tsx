/**
 * A ROSTER THAT PARTLY FAILED SAYS SO (RC-B12 round 12).
 *
 * The caller belongs to two organizations. One roster reads, the other's read
 * fails. The hook used to return only the first organization's people with no
 * word about the second — a silently short list that reads as "these are all
 * the people". It now returns the rows it has AND names what it could not read,
 * so the surface shows the rows plus a StaleDataNotice.
 *
 * RED BEFORE GREEN: against the hook before this change, `partialFailures` is
 * undefined and the first case fails.
 */

import { renderHook, settle } from "@/test-utils/renderHook";

const OURS = "11111111-1111-4111-8111-111111111111";
const DOWN = "33333333-3333-4333-8333-333333333333";

const rpc = jest.fn(async (name: string, args: Record<string, string>) => {
  if (name === "get_organization_members_with_users") {
    if (args.p_org_id === DOWN) return { data: null, error: { message: "forced roster failure" } };
    return {
      data: [
        {
          id: "m1",
          organization_id: OURS,
          user_id: "u-colleague",
          role: "member",
          joined_at: "2026-01-01T00:00:00Z",
          invited_by: "u-me",
          user_email: "colleague@clinic.test",
          user_display_name: "Front Desk Lead",
          user_avatar_url: "",
        },
      ],
      error: null,
    };
  }
  return { data: [], error: null };
});

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ rpc: (...a: unknown[]) => rpc(...(a as [string, Record<string, string>])) }),
}));
const ME = { id: "u-me" };
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => ME }));
const CONVERSATIONS_RESULT = { conversations: [], isInitialLoading: false };
jest.mock("@ai-matrx/messaging/react", () => ({ useConversations: () => CONVERSATIONS_RESULT }));
const ORGANIZATIONS_RESULT = {
  organizations: [
    { id: OURS, name: "Cedar Ridge Dental", role: "owner" },
    { id: DOWN, name: "Calder Approvals", role: "member" },
  ],
  loading: false,
};
jest.mock("@/features/organizations/hooks", () => ({ useUserOrganizations: () => ORGANIZATIONS_RESULT }));
jest.mock("@/features/organizations/service/invitationsService", () => ({
  invitationsService: { listForTarget: async () => ({ ok: true, data: { invitations: [] } }) },
}));
jest.mock("@/features/organizations/types", () => ({ canManageInvitations: () => false }));

import { useUserConnections, describeConnectionFailures } from "../useUserConnections";
import { forgetOrganizationMemberRows } from "@/features/organizations/service/orgMemberRows";

beforeEach(() => forgetOrganizationMemberRows());

describe("useUserConnections — a partly failed roster names what it could not read", () => {
  it("keeps the rows it read and names the organization it could not", async () => {
    const hook = await renderHook(() => useUserConnections());
    await settle(hook, (v) => !v.isLoading, "the connections to load");

    expect(hook.current.connections.map((c) => c.email)).toEqual(["colleague@clinic.test"]);
    expect(hook.current.error).toBeNull();
    expect(hook.current.partialFailures).toEqual([
      { source: "Calder Approvals", error: expect.stringContaining("forced roster failure") },
    ]);
    expect(describeConnectionFailures(hook.current.partialFailures)).toBe("the people in Calder Approvals");
  });
});
