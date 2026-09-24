/**
 * A PEOPLE LIST IS SCOPED TO THE ORGANIZATION THE SURFACE IS ABOUT (FIX-7B).
 *
 * The seventh-pass verdict opened a share dialog in a brand-new organization with exactly two
 * people in it and was offered "people from all over the database — including four of your own
 * personal email addresses and named contacts belonging to other companies". Two sources did
 * that, and this file holds both of them shut:
 *
 *   1. the hook read EVERY organization the caller belongs to, whatever organization the thing
 *      being shared, assigned or invited into actually lives in;
 *   2. it folded in every participant of every conversation the caller has ever had, which is
 *      bounded by no organization at all.
 *
 * RED BEFORE GREEN: run this file against the hook as it stood before FIX-7B and both of the
 * first two cases fail — "Dana from the other company" and "arman's personal address" are both
 * in the list.
 */

import { renderHook, settle } from "@/test-utils/renderHook";

const MINE = "11111111-1111-4111-8111-111111111111";
const THEIRS = "22222222-2222-4222-8222-222222222222";

const membersByOrg: Record<string, Array<Record<string, unknown>>> = {
  [MINE]: [
    {
      id: "m1",
      organization_id: MINE,
      user_id: "u-colleague",
      role: "member",
      joined_at: "2026-01-01T00:00:00Z",
      invited_by: "u-me",
      user_email: "colleague@thisorg.test",
      user_display_name: "A Colleague",
      user_avatar_url: "",
    },
  ],
  [THEIRS]: [
    {
      id: "m2",
      organization_id: THEIRS,
      user_id: "u-dana",
      role: "member",
      joined_at: "2026-01-01T00:00:00Z",
      invited_by: "u-me",
      user_email: "dana@othercompany.test",
      user_display_name: "Dana from the other company",
      user_avatar_url: "",
    },
  ],
};

const rpc = jest.fn(async (name: string, args: Record<string, string>) => {
  if (name === "get_organization_members_with_users") {
    return { data: membersByOrg[args.p_org_id] ?? [], error: null };
  }
  return { data: [], error: null };
});

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ rpc: (...a: unknown[]) => rpc(...(a as [string, Record<string, string>])) }),
}));

// Stable references keep this suite about scope. The hook no longer re-fetches when the inbox
// hands back a fresh array (the real messaging store does on every emit) — that is proven in
// useUserConnections.fetchStorm.test.tsx (MSG-STORM).
const ME = { id: "u-me" };
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => ME,
}));

const CONVERSATIONS = [
  {
    participants: [
      { userId: "u-me", email: "me@test.test", displayName: "Me", avatarUrl: "" },
      {
        userId: "u-personal",
        email: "arman.personal@gmail.test",
        displayName: "arman's personal address",
        avatarUrl: "",
      },
    ],
  },
];
const CONVERSATIONS_RESULT = { conversations: CONVERSATIONS, isInitialLoading: false };
jest.mock("@ai-matrx/messaging/react", () => ({
  useConversations: () => CONVERSATIONS_RESULT,
}));

const ORGANIZATIONS_RESULT = {
  organizations: [
    { id: MINE, name: "This Organization", role: "owner", isPersonal: false },
    { id: THEIRS, name: "The Other Company", role: "member", isPersonal: false },
  ],
  loading: false,
};
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ORGANIZATIONS_RESULT,
}));

jest.mock("@/features/organizations/service/invitationsService", () => ({
  invitationsService: { listForTarget: async () => ({ ok: true, data: { invitations: [] } }) },
}));

jest.mock("@/features/organizations/types", () => ({
  canManageInvitations: () => true,
}));

import { useUserConnections } from "../useUserConnections";

describe("useUserConnections — a people list stays in one organization", () => {
  beforeEach(() => rpc.mockClear());

  it("named an organization, it offers that organization's members and nobody else", async () => {
    const hook = await renderHook(() => useUserConnections({ organizationId: MINE }));
    await settle(hook, (v) => !v.isLoading, "the connections to load");

    const emails = hook.current.connections.map((c) => c.email);
    expect(emails).toEqual(["colleague@thisorg.test"]);
    expect(emails).not.toContain("dana@othercompany.test");
    expect(rpc).toHaveBeenCalledWith("get_organization_members_with_users", { p_org_id: MINE });
    expect(rpc).not.toHaveBeenCalledWith("get_organization_members_with_users", {
      p_org_id: THEIRS,
    });
  });

  it("never folds in somebody reached only through a past conversation", async () => {
    const hook = await renderHook(() => useUserConnections({ organizationId: MINE }));
    await settle(hook, (v) => !v.isLoading, "the connections to load");

    expect(hook.current.connections.map((c) => c.email)).not.toContain(
      "arman.personal@gmail.test",
    );
  });

  it("the surface that IS about conversations still gets them", async () => {
    const hook = await renderHook(() => useUserConnections({ includeConversations: true }));
    await settle(hook, (v) => !v.isLoading, "the connections to load");

    expect(hook.current.connections.map((c) => c.email)).toContain("arman.personal@gmail.test");
  });
});
