// features/entitlements/__tests__/spend-fails-closed.test.ts
//
// INVARIANT: A SPEND PATH FAILS CLOSED WHEN THE RESOLVER ERRORS.
//
// `types.ts` states the split in words — "we FAIL OPEN for reads and FAIL CLOSED
// for spend" — and until this file existed nothing held it. The asymmetry is the
// whole point: a resolver hiccup must never turn a working surface into an error
// page (reads), but it must also never hand out unlimited paid AI generation
// because the meter could not be reached (spend).
//
// Whether a capability is enforced is the DATABASE's answer
// (billing.capability.enforced, returned on the verdict). The client keeps no
// copy, so it always asks: an un-enforced capability comes back
// `permissive_stub` from the resolver, and a resolver error refuses regardless,
// because without an answer there is nothing to be permissive on.

import { CAPABILITY_REGISTRY, type Capability } from "../registry";
import { checkEntitlement } from "../service";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }),
}));

/** Any capability — enforcement is the resolver's answer, not a fixture. */
const ENFORCED = "outreach.send_volume" as const;
const UNENFORCED = "platform.points" as const;

beforeEach(() => {
  rpc.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("a spend path fails closed when the resolver errors", () => {
  it("refuses when the resolver RPC returns an error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });
    const verdict = await checkEntitlement(ENFORCED, { organizationId: "org-1" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("resolver_error");
  });

  it("refuses when the resolver returns no data at all", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const verdict = await checkEntitlement(ENFORCED, { organizationId: "org-1" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("resolver_error");
  });

  it("refuses when the resolver call throws", async () => {
    rpc.mockImplementation(() => {
      throw new Error("network down");
    });
    const verdict = await checkEntitlement(ENFORCED, { organizationId: "org-1" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("resolver_error");
  });

  it("refuses when the resolver rejects", async () => {
    rpc.mockRejectedValue(new Error("timeout"));
    const verdict = await checkEntitlement(ENFORCED, { organizationId: "org-1" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("resolver_error");
  });

  it("passes the resolver's own refusal through unchanged", async () => {
    rpc.mockResolvedValue({
      data: {
        allowed: false,
        remaining: 0,
        limit: 100,
        used: 100,
        tier: "free",
        reason: "cap_reached",
        period: "month",
        windows: [],
        check_id: null,
        required_tier: "premium",
      },
      error: null,
    });
    const verdict = await checkEntitlement(ENFORCED, { organizationId: "org-1" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("cap_reached");
    // The refusal names its own fix (no-dead-ends doctrine).
    expect(verdict.requiredTier).toBe("premium");
  });

  it("asks the resolver even when the database has the capability un-enforced", async () => {
    rpc.mockResolvedValue({
      data: {
        allowed: true,
        remaining: null,
        limit: null,
        used: 0,
        tier: "free",
        reason: "permissive_stub",
        period: "month",
        windows: [],
        enforced: false,
        check_id: "c-1",
      },
      error: null,
    });
    const verdict = await checkEntitlement(UNENFORCED, { organizationId: "org-1" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("permissive_stub");
    expect(verdict.period).toBe("month");
  });

  it("refuses an un-enforced capability too when the resolver cannot answer", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });
    const verdict = await checkEntitlement(UNENFORCED, { organizationId: "org-1" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("resolver_error");
  });

  // Replaced 2026-09-29: this used to assert a dev scream while the verdict
  // "fell back to the USER's tier alone". There is no user tier any more
  // (billing.user_plan retired, DD-047) — the check is held for an organization
  // instead (a-tier-belongs-to-an-organization.test.ts). What must still hold
  // here: with no organization obtainable, the spend path refuses and the
  // resolver is never asked a question without one.
  it("never resolves an org capability without an organization — it refuses instead", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    const orgScoped = (Object.keys(CAPABILITY_REGISTRY) as Capability[]).find(
      (c) => CAPABILITY_REGISTRY[c].scope === "org",
    );
    expect(orgScoped).toBeDefined();
    const verdict = await checkEntitlement(orgScoped!);
    expect(verdict.allowed).toBe(false);
    for (const call of rpc.mock.calls) {
      expect((call[1] as { p_org?: string }).p_org).toBeTruthy();
    }
  });
});
