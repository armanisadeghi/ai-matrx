// features/entitlements/__tests__/visible-limit-decrements.test.ts
//
// INVARIANT: A VISIBLE LIMIT MUST DECREMENT.
//
// The TRUST mandate's whole claim is that we show the limit BEFORE the action
// instead of ambushing mid-workflow. That claim is a lie the moment a meter
// renders "8 of 10 left" and keeps saying it after the ninth generation. F6
// (2026-07-13) made every metered action record real usage on success — this
// test is what stops it silently regressing.
//
// The two ways it can regress, both covered here:
//   1. `consumeEntitlement` short-circuiting on `enforced: false`. Every
//      education capability is un-enforced today, so a short-circuit there
//      would leave the whole product's meters frozen at full while users spend.
//   2. The consume result not reaching the meter — `usageFromConsume` +
//      `setCapabilityUsage` + the verdict selector must carry the new
//      `remaining` through to what a surface renders.

import { CAPABILITY_REGISTRY } from "../registry";
import { consumeEntitlement, usageFromConsume } from "../service";
import reducer, {
  setCapabilityUsage,
  setEntitlementSnapshot,
} from "../state/entitlementsSlice";
import { makeSelectEntitlement } from "../state/selectors";
import type { RootState } from "@/lib/redux/rootReducer";
import type { EntitlementConsumeResult, EntitlementSnapshot } from "../types";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }),
}));

// An UN-ENFORCED capability on purpose — the case a short-circuit would
// break. Was education.generate_cards until the 2026-08-22 Q2 flip enforced
// all 16 education capabilities; platform.points is the surviving live
// un-enforced example (real users spend it today, limits visible, no cap).
const CAP = "platform.points" as const;

const asState = (e: unknown) => ({ entitlements: e }) as unknown as RootState;

beforeEach(() => {
  rpc.mockReset();
});

describe("a visible limit must decrement", () => {
  it("the capability under test is genuinely un-enforced", () => {
    // If someone flips this one on, the test below stops proving what it says.
    expect(CAPABILITY_REGISTRY[CAP].enforced).toBe(false);
  });

  it("records usage even while the capability is un-enforced", async () => {
    rpc.mockResolvedValue({
      data: {
        allowed: true,
        remaining: 7,
        limit: 10,
        used: 3,
        tier: "free",
        reason: "allowed",
        period: "month",
        windows: [
          {
            period: "month",
            used: 3,
            limit: 10,
            remaining: 7,
            resetsAt: "2026-09-01T00:00:00Z",
          },
        ],
        enforced: false,
        consumed: true,
      },
      error: null,
    });

    const result = await consumeEntitlement(CAP);

    // The round trip HAPPENED — no `enforced: false` short-circuit.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "entitlement_consume",
      expect.objectContaining({ p_capability: CAP, p_quantity: 1 }),
    );
    expect(result?.consumed).toBe(true);
    expect(result?.remaining).toBe(7);
  });

  it("carries the new remaining all the way to the rendered verdict", () => {
    const snapshot: EntitlementSnapshot = {
      tier: "free",
      isSubscribed: false,
      trialEndsAt: null,
      usage: {
        [CAP]: {
          used: 2,
          limit: 10,
          period: "month",
          resetsAt: "2026-09-01T00:00:00Z",
          enforced: false,
          windows: [
            {
              period: "month",
              used: 2,
              limit: 10,
              remaining: 8,
              resetsAt: "2026-09-01T00:00:00Z",
            },
          ],
        },
      },
      fetchedAt: Date.now(),
    };

    let state = reducer(undefined, setEntitlementSnapshot(snapshot));
    const select = makeSelectEntitlement(CAP);

    const before = select(asState(state));
    expect(before.remaining).toBe(8);
    expect(before.limit).toBe(10);

    // …one generation succeeds and its consume comes back.
    const consumed: EntitlementConsumeResult = {
      capability: CAP,
      allowed: true,
      remaining: 7,
      limit: 10,
      used: 3,
      tier: "free",
      reason: "allowed",
      period: "month",
      windows: [
        {
          period: "month",
          used: 3,
          limit: 10,
          remaining: 7,
          resetsAt: "2026-09-01T00:00:00Z",
        },
      ],
      isLoading: false,
      enforced: false,
      consumed: true,
      duplicate: false,
    };

    state = reducer(
      state,
      setCapabilityUsage({ capability: CAP, usage: usageFromConsume(consumed) }),
    );

    const after = select(asState(state));
    expect(after.remaining).toBe(7);
    expect(after.used).toBe(3);
    expect(after.limit).toBe(10);
    // Still un-enforced: the meter moved, nothing was blocked. Both halves of
    // the honesty claim at once.
    expect(after.allowed).toBe(true);
    expect(after.reason).toBe("permissive_stub");
  });

  it("the binding window drives the meter when several windows exist", () => {
    // A burst window is what actually stops a runaway session; if the meter
    // showed the roomier monthly number the user would be ambushed by the cap
    // they could not see. The most-restrictive window must win.
    const consumed: EntitlementConsumeResult = {
      capability: CAP,
      allowed: true,
      remaining: 40,
      limit: 50,
      used: 10,
      tier: "free",
      reason: "allowed",
      period: "month",
      windows: [
        { period: "month", used: 10, limit: 50, remaining: 40, resetsAt: null },
        { period: "rolling_5h", used: 4, limit: 5, remaining: 1, resetsAt: null },
      ],
      isLoading: false,
      enforced: false,
      consumed: true,
      duplicate: false,
    };
    const state = reducer(
      undefined,
      setCapabilityUsage({ capability: CAP, usage: usageFromConsume(consumed) }),
    );
    const verdict = makeSelectEntitlement(CAP)(asState(state));
    expect(verdict.period).toBe("rolling_5h");
    expect(verdict.remaining).toBe(1);
    expect(verdict.limit).toBe(5);
  });

  it("a failed consume returns null so the caller re-hydrates rather than lying", () => {
    // Silently returning a fabricated verdict here would freeze the meter at a
    // stale number — the exact dishonesty this invariant exists to prevent.
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    return expect(consumeEntitlement(CAP)).resolves.toBeNull();
  });
});
