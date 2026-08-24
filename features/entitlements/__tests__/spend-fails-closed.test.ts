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
// The un-enforced half is tested too: while `enforced: false` a capability is
// permissive WITHOUT a round trip, which is what makes the per-capability
// rollout switch a switch at all.

import { CAPABILITY_REGISTRY, type Capability } from "../registry";
import { checkEntitlement } from "../service";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }),
}));

/** An enforced capability — the only kind that can reach the resolver. */
const ENFORCED = "outreach.send_volume" as const;
/** An un-enforced one (education flipped to enforced 2026-08-22, Q2 ruling —
 *  platform.points is the surviving live un-enforced example). */
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
  it("the fixtures still hold the enforcement states this test assumes", () => {
    expect(CAPABILITY_REGISTRY[ENFORCED].enforced).toBe(true);
    expect(CAPABILITY_REGISTRY[UNENFORCED].enforced).toBe(false);
  });

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

  it("an un-enforced capability is permissive with NO round trip", async () => {
    const verdict = await checkEntitlement(UNENFORCED);
    expect(rpc).not.toHaveBeenCalled();
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("permissive_stub");
  });

  it("screams in dev rather than resolving an org capability without an org", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    const orgScoped = (Object.keys(CAPABILITY_REGISTRY) as Capability[]).find(
      (c) => CAPABILITY_REGISTRY[c].enforced && CAPABILITY_REGISTRY[c].scope === "org",
    );
    expect(orgScoped).toBeDefined();
    await checkEntitlement(orgScoped!);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("was checked with no"),
    );
  });
});
