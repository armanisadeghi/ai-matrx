/**
 * @jest-environment jsdom
 */
/**
 * LANE SHELL-DEDUPE — THE SHELL BOOT READS EACH SHARED DOOR ONCE.
 *
 * Measured at boot on a table page as admin: `get_dm_conversations_with_details` x4,
 * `knob_snapshot_delta` x3, `user_preferences` x2, `assists` x2, `get_dm_pending_soft_expiries` x2,
 * on top of the organizations / work_inbox / entitlement_snapshot reads already shared. Every surface
 * that asks a door at boot must share ONE read per (person, question). This file asks each door the
 * way boot does — several surfaces, one moment — and fails if any is called more than once.
 */
const USER = "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081";
const ORG = "7721ceda-72f0-4e4c-b712-00cf9dc8f117";

const calls: Record<string, number> = {};
const bump = (door: string) => (calls[door] = (calls[door] ?? 0) + 1);

// ── the wire ────────────────────────────────────────────────────────────────
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => USER, requireUserId: () => USER }));
jest.mock("@/utils/supabase/adminLane", () => ({ browserAdminLaneOpen: () => false }));
jest.mock("@/lib/redux/store-singleton", () => ({ getStoreSingleton: () => null }));
jest.mock("@/lib/client-directives/directiveRegistry", () => ({ registerDirectiveHandler: jest.fn() }));
jest.mock("@/lib/scoped-config/deviceId", () => ({ getWebDeviceId: () => null }));
jest.mock("@/features/organizations/awaitWorkspace", () => ({
  awaitEffectiveOrganizationId: async () => ({ status: "ready", organizationId: ORG }),
}));
jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: {
    forUser: async () => {
      bump("memberships");
      return { ok: true, data: { memberships: [{ containerId: ORG, role: "owner" }] } };
    },
  },
}));

function builder(door: string, row: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "is", "order", "range"]) q[m] = () => q;
  q.maybeSingle = () => {
    bump(door);
    return Promise.resolve({ data: row, error: null });
  };
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    bump(door);
    return Promise.resolve({ data: [row], error: null }).then(res, rej);
  };
  return q;
}

function rpc(fn: string, args: Record<string, unknown>) {
  bump(fn);
  if (fn === "knob_defaults") return Promise.resolve({ data: { version: "d1", unchanged: false, defaults: { "a.b": 1 } }, error: null });
  if (fn === "knob_snapshot_delta") return Promise.resolve({ data: { etag: "e", defaults_version: "d1", unchanged: false, overrides: {} }, error: null });
  if (fn === "entitlement_snapshot") return Promise.resolve({ data: { tier: "pro", is_subscribed: true, trial_ends_at: null, usage: {} }, error: null });
  return Promise.resolve({ data: [{ fn, args }], error: null });
}

const wire = {
  schema: (name: string) => ({
    rpc,
    from: (table: string) =>
      builder(
        `${name}.${table}`,
        table === "user_preferences"
          ? { preferences: {}, last_active_organization_id: ORG, startup_organization_id: null }
          : { id: ORG, name: "Northwind Recycling", archived_at: null },
      ),
  }),
  rpc,
};
jest.mock("@/utils/supabase/client", () => ({ supabase: wire, createClient: () => wire }));

import { readMemberOrganizationRows, forgetMemberOrganizationRows } from "@/features/organizations/service/memberOrganizationRows";
import { sharedInboxRead, forgetWaitingWorkInbox } from "@/features/approvals/sharedInbox";
import { fetchEntitlementSnapshot, forgetEntitlementSnapshot } from "@/features/entitlements/service";
import { withSharedRpcReads } from "@/lib/supabase/sharedRpcReads";
import { ensureKnobSnapshot, invalidateEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { readAccountOrganizationChoices } from "@/lib/organizations/accountOrganizationChoices";
import { readAccountPreferencesRow, forgetAccountPreferencesRow } from "@/lib/account/accountPreferencesRow";
import { createSharedReads } from "@/lib/sharedReads";
import { isOnlyPainted } from "@/lib/scoped-config/paintedOrganization";

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  forgetMemberOrganizationRows();
  forgetWaitingWorkInbox();
  forgetEntitlementSnapshot();
  forgetAccountPreferencesRow();
  invalidateEffectiveKnob();
  window.localStorage.clear();
});

it("boot: every shared door is called once however many surfaces ask in the same moment", async () => {
  const messaging = withSharedRpcReads(wire, {
    rpcs: ["get_dm_conversations_with_details", "get_dm_pending_soft_expiries"],
    person: () => USER,
  });
  const listArgs = { p_user_id: USER, p_limit: 31, p_before_sort_at: null, p_before_conversation_id: null, p_archived: "active" };
  const ids = { p_conversation_ids: ["c1", "c2"] };
  const inbox = async () => (bump("work_inbox"), [{ item_id: "i1" }]);

  // Each surface asks as it does at boot — twice, because an engine restarts / a second surface mounts.
  const asks = [0, 1].flatMap(() => [
    readMemberOrganizationRows(),
    sharedInboxRead(USER, inbox),
    fetchEntitlementSnapshot(),
    messaging.schema("public").rpc("get_dm_conversations_with_details", listArgs),
    messaging.schema("public").rpc("get_dm_pending_soft_expiries", ids),
    ensureKnobSnapshot(ORG, USER),
    readAccountOrganizationChoices(USER), // the load ladder
    readAccountPreferencesRow(USER), // the preferences slice
  ]);
  await Promise.all(asks);

  expect({
    organizations: calls["iam.organizations"],
    memberships: calls.memberships,
    work_inbox: calls.work_inbox,
    entitlement_snapshot: calls.entitlement_snapshot,
    get_dm_conversations_with_details: calls.get_dm_conversations_with_details,
    get_dm_pending_soft_expiries: calls.get_dm_pending_soft_expiries,
    knob_snapshot_delta: calls.knob_snapshot_delta,
    user_preferences: calls["users.user_preferences"],
  }).toEqual({
    organizations: 1,
    memberships: 1,
    work_inbox: 1,
    entitlement_snapshot: 1,
    get_dm_conversations_with_details: 1,
    get_dm_pending_soft_expiries: 1,
    knob_snapshot_delta: 1,
    user_preferences: 1,
  });
});

it("control: the same two asks on the bare client ARE counted twice (the counter sees duplicates)", async () => {
  const args = { p_user_id: USER, p_archived: "active" };
  await wire.schema("public").rpc("get_dm_conversations_with_details", args);
  await wire.schema("public").rpc("get_dm_conversations_with_details", args);
  expect(calls.get_dm_conversations_with_details).toBe(2);
});

it("a different question is its own read (another archive filter, another organization's knobs)", async () => {
  const messaging = withSharedRpcReads(wire, { rpcs: ["get_dm_conversations_with_details"], person: () => USER });
  await messaging.schema("public").rpc("get_dm_conversations_with_details", { p_user_id: USER, p_archived: "active" });
  await messaging.schema("public").rpc("get_dm_conversations_with_details", { p_user_id: USER, p_archived: "archived" });
  await ensureKnobSnapshot(ORG, USER);
  await ensureKnobSnapshot(null, USER);
  expect(calls.get_dm_conversations_with_details).toBe(2);
  expect(calls.knob_snapshot_delta).toBe(2);
});

it("one person's read is never another's, a failed read is never shared, and a write forgets", async () => {
  const reads = createSharedReads(5_000);
  let n = 0;
  const ask = (person: string | null) => reads.read(person, "q", async () => ({ n: ++n }));
  const [a, b] = await Promise.all([ask("p1"), ask("p2")]);
  expect(a.n).not.toBe(b.n);
  await ask(null);
  await ask(null);
  expect(n).toBe(4); // no person → nothing shared

  let failures = 0;
  const failing = () => reads.read("p1", "bad", async () => ({ error: ++failures }), { isFailure: () => true });
  await failing();
  await failing();
  expect(failures).toBe(2);

  reads.forget("q");
  await ask("p1");
  expect(n).toBe(5);
});

it("a cache-painted organization is not asked about before the load ladder answers", () => {
  const painted = { appContext: { organization_id: "0a54df90", orgBootstrapResolved: false } };
  expect(isOnlyPainted("0a54df90", painted)).toBe(true);
  expect(isOnlyPainted("0a54df90", { appContext: { organization_id: "0a54df90", orgBootstrapResolved: true } })).toBe(false);
  expect(isOnlyPainted("other-page-org", painted)).toBe(false);
  expect(isOnlyPainted(null, painted)).toBe(false);
});
