// LANE DEDUPE-READS. The boot effect and the usage gate each asked `billing.entitlement_snapshot`
// for the same organization within the same second (measured twice with the same p_org). One
// organization, one read: asks in flight and within SNAPSHOT_SHARED_MS share it; `fresh` (a purchase
// returning, a failed consume) asks again; a failed read is never kept.

import { fetchEntitlementSnapshot, forgetEntitlementSnapshot } from "../service";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }),
}));
const awaitEffectiveOrganizationId = jest.fn();
jest.mock("@/features/organizations/awaitWorkspace", () => ({
  awaitEffectiveOrganizationId: () => awaitEffectiveOrganizationId(),
}));

const ORG_A = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const ORG_B = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const ROW = { tier: "premium", is_subscribed: true, trial_ends_at: null, usage: {} };

beforeEach(() => {
  forgetEntitlementSnapshot();
  rpc.mockReset();
  awaitEffectiveOrganizationId.mockReset();
  awaitEffectiveOrganizationId.mockResolvedValue({ status: "ready", organizationId: ORG_A });
});

describe("the entitlement snapshot is read once per organization", () => {
  it("two simultaneous boot asks and a later one make one read", async () => {
    rpc.mockResolvedValue({ data: ROW, error: null });
    await Promise.all([fetchEntitlementSnapshot(), fetchEntitlementSnapshot()]);
    await fetchEntitlementSnapshot();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("another organization, or a fresh ask, reads again", async () => {
    rpc.mockResolvedValue({ data: ROW, error: null });
    await fetchEntitlementSnapshot();
    await fetchEntitlementSnapshot({ fresh: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    awaitEffectiveOrganizationId.mockResolvedValue({ status: "ready", organizationId: ORG_B });
    await fetchEntitlementSnapshot();
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("a failed read is not kept", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    rpc.mockResolvedValue({ data: ROW, error: null });
    const first = await fetchEntitlementSnapshot();
    expect(first?.tier).toBe("free");
    const second = await fetchEntitlementSnapshot();
    expect(second?.tier).toBe("premium");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
