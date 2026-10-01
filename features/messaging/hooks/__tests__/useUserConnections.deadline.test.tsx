/**
 * A PEOPLE LIST ANSWERS WITHIN SECONDS (PB-07, 2026-10-01).
 *
 * The Share dialog sat on "Loading contacts…" for minutes: the viewer belonged to ~60
 * organizations, every roster was read one after another, and a roster that never answered held
 * the whole list forever. These cases drive the hook with the clock under test control.
 *
 * RED BEFORE GREEN: against the sequential, deadline-free hook, case 1 is still loading after the
 * deadline (the hung roster holds the list) and case 2 is still loading after 400 ms (twelve
 * 100 ms reads in a row need 1.2 s).
 */

import { renderHook, type HookHandle } from "@/test-utils/renderHook";
import type { useUserConnections as UseUserConnections } from "../useUserConnections";

const OURS = "11111111-1111-4111-8111-111111111111";
const HUNG = "22222222-2222-4222-8222-222222222222";

let mode: "hung" | "slow" = "hung";
const rpc = jest.fn((name: string, args: Record<string, string>) => {
  if (name !== "get_organization_members_with_users") return Promise.resolve({ data: [], error: null });
  const row = {
    id: `m-${args.p_org_id}`,
    organization_id: args.p_org_id,
    user_id: `u-${args.p_org_id}`,
    role: "member",
    joined_at: "2026-01-01T00:00:00Z",
    invited_by: "u-me",
    user_email: `${args.p_org_id.slice(0, 4)}@clinic.test`,
    user_display_name: "",
    user_avatar_url: "",
  };
  if (mode === "hung" && args.p_org_id === HUNG) return new Promise(() => undefined);
  if (mode === "slow") {
    return new Promise((resolve) => setTimeout(() => resolve({ data: [row], error: null }), 100));
  }
  return Promise.resolve({ data: [row], error: null });
});

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ rpc: (...a: unknown[]) => rpc(...(a as [string, Record<string, string>])) }),
}));
const ME = { id: "u-me" };
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => ME }));
jest.mock("@ai-matrx/messaging/react", () => ({
  useConversations: () => ({ conversations: [], isInitialLoading: false }),
}));
let organizationsResult: {
  organizations: Array<{ id: string; name: string; role: string }>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} = { organizations: [], loading: false, error: null, refresh: () => undefined };
jest.mock("@/features/organizations/hooks", () => ({ useUserOrganizations: () => organizationsResult }));
jest.mock("@/features/organizations/service/invitationsService", () => ({
  invitationsService: { listForTarget: async () => ({ ok: true, data: { invitations: [] } }) },
}));
jest.mock("@/features/organizations/types", () => ({ canManageInvitations: () => false }));

import {
  useUserConnections,
  ROSTER_SWEEP_DEADLINE_MS,
  CONNECTIONS_LOAD_DEADLINE_MS,
} from "../useUserConnections";
import { forgetOrganizationMemberRows } from "@/features/organizations/service/orgMemberRows";

type Hook = HookHandle<ReturnType<typeof UseUserConnections>>;
const advance = (hook: Hook, ms: number) => hook.act(async () => {
  await jest.advanceTimersByTimeAsync(ms);
});

beforeEach(() => {
  jest.useFakeTimers();
  forgetOrganizationMemberRows();
  rpc.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("useUserConnections — a people list answers within seconds", () => {
  it("names a roster that never answers instead of loading forever", async () => {
    mode = "hung";
    organizationsResult = {
      organizations: [
        { id: OURS, name: "Cedar Ridge Dental", role: "owner" },
        { id: HUNG, name: "Calder Approvals", role: "member" },
      ],
      loading: false,
      error: null,
      refresh: () => undefined,
    };
    const hook = await renderHook(() => useUserConnections());
    await advance(hook, ROSTER_SWEEP_DEADLINE_MS + 50);

    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.connections.map((c) => c.user_id)).toEqual([`u-${OURS}`]);
    expect(hook.current.partialFailures).toEqual([
      { source: "Calder Approvals", error: expect.stringContaining("did not answer") },
    ]);
    await hook.unmount();
  });

  it("reads many organizations a few at a time, not one after another", async () => {
    mode = "slow";
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
      name: `Org ${i}`,
      role: "member",
    }));
    organizationsResult = { organizations: many, loading: false, error: null, refresh: () => undefined };
    const hook = await renderHook(() => useUserConnections());
    await advance(hook, 400);

    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.connections).toHaveLength(12);
    expect(hook.current.partialFailures).toEqual([]);
    await hook.unmount();
  });

  it("stops loading at its own deadline when the organizations never arrive, and says so", async () => {
    organizationsResult = { organizations: [], loading: true, error: null, refresh: () => undefined };
    const hook = await renderHook(() => useUserConnections());
    await advance(hook, CONNECTIONS_LOAD_DEADLINE_MS + 50);

    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.error).toBe("Contacts did not load in time");
    await hook.unmount();
  });

  it("says the organizations could not be read rather than 'no contacts'", async () => {
    organizationsResult = { organizations: [], loading: false, error: "forced", refresh: () => undefined };
    const hook = await renderHook(() => useUserConnections());
    await advance(hook, 10);

    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.error).toContain("Couldn't load your organizations");
    await hook.unmount();
  });
});
