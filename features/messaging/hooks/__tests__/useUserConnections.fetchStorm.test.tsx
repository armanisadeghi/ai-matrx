/**
 * THE PEOPLE LIST FETCHES EACH ORGANIZATION'S MEMBERS ONCE, NOT ONCE PER INBOX TICK (MSG-STORM,
 * 2026-09-23).
 *
 * Live on /messages as admin@admin.com (43 organizations): opening ONE conversation fired 260
 * `get_organization_members_with_users` requests — six overlapping full sweeps — and the tab
 * filled with "Error fetching members for org … Failed to fetch" as the storm starved every
 * other request on the page. Two defects made it:
 *
 *   1. the member fetch was keyed on the conversation list. Every messaging-store emit (open,
 *      mark-read, a new message) hands back a new `conversations` array, so every emit re-ran
 *      a full sweep over every organization — even though no organization's members depend on
 *      the inbox at all, and even on surfaces that never show conversation people;
 *   2. a superseded sweep never stopped. The effect's `mounted` flag was only read after the
 *      whole sweep, so each re-run started a new sweep while the old ones kept issuing requests.
 *
 * RED BEFORE GREEN: against the hook as it stood before MSG-STORM, the first two cases count
 * extra member requests and the third sees the abandoned sweep keep going.
 */

import * as React from "react";
import { renderHook, settle } from "@/test-utils/renderHook";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

function member(orgId: string, userId: string, name: string) {
  return {
    id: `m-${userId}`,
    organization_id: orgId,
    user_id: userId,
    role: "member",
    joined_at: "2026-01-01T00:00:00Z",
    invited_by: "u-me",
    user_email: `${userId}@example.test`,
    user_display_name: name,
    user_avatar_url: "",
  };
}

const membersByOrg: Record<string, Array<Record<string, unknown>>> = {
  [ORG_A]: [member(ORG_A, "u-priya", "Priya Raman")],
  [ORG_B]: [member(ORG_B, "u-marcus", "Marcus Ortiz")],
};

// When set, every member request waits on this gate — lets a test abandon a sweep mid-flight.
let gate: Promise<void> | null = null;

const rpc = jest.fn(async (name: string, args: Record<string, string>) => {
  if (gate) await gate;
  if (name === "get_organization_members_with_users") {
    return { data: membersByOrg[args.p_org_id] ?? [], error: null };
  }
  return { data: [], error: null };
});

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    rpc: (...a: unknown[]) => rpc(...(a as [string, Record<string, string>])),
  }),
}));

const ME = { id: "u-me" };
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => ME,
}));

function inbox(people: Array<{ userId: string; displayName: string }>) {
  return {
    conversations: [
      {
        participants: [
          { userId: "u-me", email: "me@example.test", displayName: "Me", avatarUrl: "" },
          ...people.map((p) => ({
            userId: p.userId,
            email: `${p.userId}@example.test`,
            displayName: p.displayName,
            avatarUrl: "",
          })),
        ],
      },
    ],
    isInitialLoading: false,
  };
}

// The messaging store hands back a NEW conversations array on every emit — this mock does the
// same on purpose, because that is exactly the real engine's behavior the hook must survive.
let conversationsResult = inbox([{ userId: "u-lena", displayName: "Lena Brooks" }]);
jest.mock("@ai-matrx/messaging/react", () => ({
  useConversations: () => conversationsResult,
}));

const ORGANIZATIONS_RESULT = {
  organizations: [
    { id: ORG_A, name: "Ashford Labs", role: "owner", isPersonal: false },
    { id: ORG_B, name: "Cedar Ridge Dental", role: "member", isPersonal: false },
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

type Options = Parameters<typeof useUserConnections>[0];

/** Render the hook with a handle to force a re-render, the way a store emit does. */
async function renderWithRerender(options: Options) {
  let bump: () => void = () => undefined;
  const hook = await renderHook(() => {
    const [, setTick] = React.useState(0);
    bump = () => setTick((t) => t + 1);
    return useUserConnections(options);
  });
  return { hook, rerender: () => hook.act(async () => bump()) };
}

const memberCalls = () =>
  rpc.mock.calls.filter(([name]) => name === "get_organization_members_with_users").length;

/** Flush pending microtasks/timers so any sweep that is going to run has run. */
async function drain(hook: { act: (fn: () => Promise<void>) => Promise<void> }) {
  for (let i = 0; i < 10; i += 1) {
    await hook.act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe("useUserConnections — one member fetch per organization, not per inbox tick", () => {
  beforeEach(() => {
    rpc.mockClear();
    gate = null;
    conversationsResult = inbox([{ userId: "u-lena", displayName: "Lena Brooks" }]);
  });

  it("the conversation surface does not re-sweep every organization when the inbox emits", async () => {
    const { hook, rerender } = await renderWithRerender({ includeConversations: true });
    await settle(hook, (v) => !v.isLoading, "the connections to load");
    expect(memberCalls()).toBe(2);

    // Five inbox emits: open, mark-read, a new message… each a new array, same people.
    for (let i = 0; i < 5; i += 1) {
      conversationsResult = inbox([{ userId: "u-lena", displayName: "Lena Brooks" }]);
      await rerender();
    }
    await drain(hook);

    expect(memberCalls()).toBe(2);
    expect(hook.current.connections.map((c) => c.display_name)).toEqual([
      "Lena Brooks",
      "Marcus Ortiz",
      "Priya Raman",
    ]);
  });

  it("somebody new in the inbox appears without refetching any organization", async () => {
    const { hook, rerender } = await renderWithRerender({ includeConversations: true });
    await settle(hook, (v) => !v.isLoading, "the connections to load");

    conversationsResult = inbox([
      { userId: "u-lena", displayName: "Lena Brooks" },
      { userId: "u-omar", displayName: "Omar Haddad" },
    ]);
    await rerender();
    await drain(hook);

    expect(memberCalls()).toBe(2);
    expect(hook.current.connections.map((c) => c.display_name)).toContain("Omar Haddad");
  });

  it("an organization-scoped picker ignores the inbox entirely", async () => {
    const { hook, rerender } = await renderWithRerender({ organizationId: ORG_A });
    await settle(hook, (v) => !v.isLoading, "the connections to load");
    for (let i = 0; i < 5; i += 1) {
      conversationsResult = inbox([{ userId: "u-lena", displayName: "Lena Brooks" }]);
      await rerender();
    }
    await drain(hook);

    expect(memberCalls()).toBe(1);
    expect(hook.current.connections.map((c) => c.display_name)).toEqual(["Priya Raman"]);
  });

  it("an abandoned sweep stops issuing requests", async () => {
    let open!: () => void;
    gate = new Promise<void>((r) => {
      open = r;
    });
    const { hook } = await renderWithRerender({ includeConversations: true });
    await drain(hook);
    expect(memberCalls()).toBe(1); // first organization in flight, parked on the gate

    await hook.unmount();
    open();
    await new Promise((r) => setTimeout(r, 20));

    expect(memberCalls()).toBe(1);
  });

  it("refresh re-reads the organizations exactly once", async () => {
    const { hook } = await renderWithRerender({ includeConversations: true });
    await settle(hook, (v) => !v.isLoading, "the connections to load");
    expect(memberCalls()).toBe(2);

    await hook.act(() => hook.current.refresh());
    await settle(hook, (v) => !v.isLoading, "the refresh to load");
    await drain(hook);

    expect(memberCalls()).toBe(4);
    expect(hook.current.connections).toHaveLength(3);
  });
});
