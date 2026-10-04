// features/entitlements/coupons/redeemCoupon.ts
//
// THE client call that redeems a coupon: POST /api/billing/coupons/redeem (the
// one door — it takes the Stripe path for a paying subscriber). Each code is
// sent at most ONCE per page lifetime: a remount, a React dev double effect or
// a second click on the same code returns the same promise instead of a second
// request (a second request would only earn "already redeemed" and hide the
// real result).

import {
  couponRefusalLine,
  redeemPlanKey,
  redeemSuccessLine,
  type RedeemOutcome,
} from "./couponCopy";

const inFlight = new Map<string, Promise<RedeemOutcome>>();

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export function redeemCoupon(code: string, fetchImpl: Fetch = fetch): Promise<RedeemOutcome> {
  const key = code.trim();
  const held = inFlight.get(key);
  if (held) return held;
  const run = (async (): Promise<RedeemOutcome> => {
    try {
      const res = await fetchImpl("/api/billing/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: key }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (res.ok) {
        return { ok: true, line: redeemSuccessLine(body), planKey: redeemPlanKey(body), body };
      }
      const b = (body ?? {}) as { error?: unknown; message?: unknown };
      const errCode = typeof b.error === "string" ? b.error : null;
      return {
        ok: false,
        code: errCode,
        line: couponRefusalLine(errCode, typeof b.message === "string" ? b.message : null),
      };
    } catch (err) {
      console.error("[coupons] redeem request failed", err);
      return { ok: false, code: null, line: "Couldn't reach the server. Try again." };
    }
  })();
  inFlight.set(key, run);
  // A failed network call may be retried by a fresh click; a server answer may not.
  void run.then((r) => {
    if (!r.ok && r.code === null) inFlight.delete(key);
  });
  return run;
}

/** Test seam only. */
export function __resetRedeemCouponForTests(): void {
  inFlight.clear();
}
