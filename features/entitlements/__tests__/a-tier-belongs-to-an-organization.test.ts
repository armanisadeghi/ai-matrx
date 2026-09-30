// features/entitlements/__tests__/a-tier-belongs-to-an-organization.test.ts
//
// INVARIANT: A TIER BELONGS TO AN ORGANIZATION (DD-047; billing.user_plan
// retired 2026-09-29). The browser never asks the billing resolver a question
// with no organization — there is no personal plan left to answer it, and the
// one-argument RPC overloads now refuse (23502). A check with no organization
// is HELD through ensureOrgId (the record's org, else the one the person works
// in, else the person sets one); closing the picker means the action does not
// run. The boot snapshot is the organization's, and hydrates nothing until one
// is resolved.
//
// Red before (2026-09-29): checkEntitlement called entitlement_check with no
// p_org whenever the caller passed none, and fetchEntitlementSnapshot called the
// no-argument entitlement_snapshot — both answered from billing.user_plan.

import { OrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { checkEntitlement, fetchEntitlementSnapshot } from "../service";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }),
}));

const ensureOrgId = jest.fn();
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: (...a: unknown[]) => ensureOrgId(...a),
}));

const awaitEffectiveOrganizationId = jest.fn();
jest.mock("@/features/organizations/awaitWorkspace", () => ({
  awaitEffectiveOrganizationId: () => awaitEffectiveOrganizationId(),
}));

/** An enforced capability — the only kind that reaches the resolver. */
const ENFORCED = "outreach.send_volume" as const;
const RINCON_PLUMBING = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

const ALLOWED_ROW = {
  allowed: true, remaining: 40, limit: 50, used: 10, tier: "premium",
  reason: "allowed", period: "month", windows: [], enforced: true, check_id: "c-1",
};

beforeEach(() => {
  rpc.mockReset();
  ensureOrgId.mockReset();
  awaitEffectiveOrganizationId.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("a tier belongs to an organization", () => {
  it("a check with no organization named asks the organization funnel, then names it to the resolver", async () => {
    ensureOrgId.mockResolvedValue(RINCON_PLUMBING);
    rpc.mockResolvedValue({ data: ALLOWED_ROW, error: null });

    const verdict = await checkEntitlement(ENFORCED);

    expect(ensureOrgId).toHaveBeenCalledWith(null);
    expect(rpc).toHaveBeenCalledWith("entitlement_check", {
      p_capability: ENFORCED,
      p_org: RINCON_PLUMBING,
    });
    expect(verdict.allowed).toBe(true);
  });

  it("the record's own organization is passed through to the funnel unchanged", async () => {
    ensureOrgId.mockImplementation(async (org: string | null) => org);
    rpc.mockResolvedValue({ data: ALLOWED_ROW, error: null });

    await checkEntitlement(ENFORCED, { organizationId: RINCON_PLUMBING });

    expect(ensureOrgId).toHaveBeenCalledWith(RINCON_PLUMBING);
    expect(rpc.mock.calls[0][1]).toEqual({ p_capability: ENFORCED, p_org: RINCON_PLUMBING });
  });

  it("closing the organization picker means the action does not run and the resolver is never asked", async () => {
    ensureOrgId.mockRejectedValue(new OrganizationSelectionCancelled());

    const verdict = await checkEntitlement(ENFORCED);

    expect(rpc).not.toHaveBeenCalled();
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("organization_required");
  });

  it("the boot snapshot hydrates nothing until an organization is resolved — never a personal plan", async () => {
    awaitEffectiveOrganizationId.mockResolvedValue({
      status: "unavailable", cause: "none", reason: "no organization selected yet",
    });

    await expect(fetchEntitlementSnapshot()).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the boot snapshot is the organization's", async () => {
    awaitEffectiveOrganizationId.mockResolvedValue({ status: "ready", organizationId: RINCON_PLUMBING });
    rpc.mockResolvedValue({
      data: { tier: "premium", is_subscribed: true, trial_ends_at: null, usage: {}, organization_id: RINCON_PLUMBING },
      error: null,
    });

    const snapshot = await fetchEntitlementSnapshot();

    expect(rpc).toHaveBeenCalledWith("entitlement_snapshot", { p_org: RINCON_PLUMBING });
    expect(snapshot?.tier).toBe("premium");
  });
});
