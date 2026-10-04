/** @jest-environment node */

/**
 * A FREE-TIME COUPON TAKES THE RIGHT PATH, AND A FAILED STRIPE CALL NEVER BURNS IT.
 *
 * The ruling (Arman 2026-10-04): free time is never endless; a person who pays gets their months
 * off the Stripe bill, everyone else gets dated free time in the database. The route is the one
 * door a client uses, so these cases pin both paths:
 *   - no live subscription  -> the database grant (billing.coupon_redeem as the person), no Stripe;
 *   - a live subscription   -> claim, a 100%-off repeating coupon for exactly X months added to the
 *                              subscription beside the discounts it already has, then settle;
 *   - Stripe fails          -> the claim is RELEASED (the coupon can be used again) and the
 *                              half-made Stripe coupon is deleted;
 *   - a database refusal    -> its named code and the right status reach the client.
 * Stripe and Supabase are stubs here: the live test-mode run is recorded in the entitlements
 * FEATURE.md change log, not simulated.
 */

import type { NextRequest } from "next/server";

const USER = { id: "11111111-2222-3333-4444-555555555555" };
let signedIn: typeof USER | null = USER;
let subscriptionRow: { stripe_subscription_id: string; cancel_at_period_end: boolean } | null = null;

const userRpc = jest.fn();
const adminRpc = jest.fn();
const subscriptionFilters: Array<[string, unknown[]]> = [];

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ schema: () => ({ rpc: (...a: unknown[]) => userRpc(...a) }) })),
}));
jest.mock("@/utils/supabase/resolveUser", () => ({
  getClaimsUser: jest.fn(async () => ({ data: { user: signedIn } })),
}));
jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: jest.fn(() => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gt", "order", "limit"]) {
      chain[m] = (...args: unknown[]) => {
        subscriptionFilters.push([m, args]);
        return chain;
      };
    }
    chain.maybeSingle = async () => ({ data: subscriptionRow, error: null });
    return { schema: () => ({ from: () => chain, rpc: (...a: unknown[]) => adminRpc(...a) }) };
  }),
}));

const stripe = {
  coupons: { create: jest.fn(), del: jest.fn() },
  subscriptions: { retrieve: jest.fn(), update: jest.fn() },
};
jest.mock("@/lib/stripe/server", () => ({
  getStripe: jest.fn(() => stripe),
  isStripeConfigured: jest.fn(() => true),
  requiredStripeMode: jest.fn(() => "test"),
}));

type Route = typeof import("./route");
let POST: Route["POST"];

function req(body: unknown): NextRequest {
  const { NextRequest: Ctor } = require("next/server") as typeof import("next/server");
  return new Ctor("http://localhost/api/billing/coupons/redeem", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as unknown as NextRequest;
}

beforeAll(async () => {
  ({ POST } = await import("./route"));
});

beforeEach(() => {
  signedIn = USER;
  subscriptionRow = null;
  subscriptionFilters.length = 0;
  userRpc.mockReset();
  adminRpc.mockReset();
  stripe.coupons.create.mockReset();
  stripe.coupons.del.mockReset().mockResolvedValue({ deleted: true });
  stripe.subscriptions.retrieve.mockReset();
  stripe.subscriptions.update.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("POST /api/billing/coupons/redeem", () => {
  it("refuses a signed-out caller before touching the database", async () => {
    signedIn = null;
    const res = await POST(req({ code: "MX-AAAA-BBBB" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("coupon_sign_in_first");
    expect(userRpc).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("gives a non-paying person dated free time through billing.coupon_redeem, never Stripe", async () => {
    userRpc.mockResolvedValue({ data: { mode: "grant", grant: { ends_at: "2026-11-04" } }, error: null });
    const res = await POST(req({ code: "  mx-aaaa-bbbb " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: "grant", result: { mode: "grant", grant: { ends_at: "2026-11-04" } } });
    expect(userRpc).toHaveBeenCalledWith("coupon_redeem", { p_code: "mx-aaaa-bbbb" });
    expect(adminRpc).not.toHaveBeenCalled();
    expect(stripe.coupons.create).not.toHaveBeenCalled();
    // The subscription read is scoped to THIS person and THIS deployment's Stripe ledger.
    expect(subscriptionFilters).toEqual(
      expect.arrayContaining([
        ["eq", ["beneficiary_user_id", USER.id]],
        ["eq", ["livemode", false]],
      ]),
    );
  });

  it("passes the database's named refusal and status through", async () => {
    userRpc.mockResolvedValue({ data: null, error: { message: "coupon_used_up", details: "This coupon has already been used." } });
    const res = await POST(req({ code: "MX-AAAA-BBBB" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "coupon_used_up", message: "This coupon has already been used." });
  });

  it("takes a paying person's months off the Stripe bill: X-month 100% coupon added beside existing discounts", async () => {
    subscriptionRow = { stripe_subscription_id: "sub_test_1", cancel_at_period_end: false };
    adminRpc.mockImplementation(async (fn: string) =>
      fn === "coupon_claim_for_subscription"
        ? { data: { redemption_id: "red-1", coupon_id: "cou-1", months: 3 }, error: null }
        : { data: { status: "stripe_applied" }, error: null },
    );
    stripe.coupons.create.mockResolvedValue({ id: "stripe_coupon_1" });
    stripe.subscriptions.retrieve.mockResolvedValue({ discounts: ["di_existing", { id: "di_obj" }] });
    stripe.subscriptions.update.mockResolvedValue({});

    const res = await POST(req({ code: "MX-AAAA-BBBB" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "stripe", months: 3, stripe_coupon_id: "stripe_coupon_1", subscription_id: "sub_test_1" });
    expect(userRpc).not.toHaveBeenCalled();
    expect(adminRpc).toHaveBeenNthCalledWith(1, "coupon_claim_for_subscription", {
      p_code: "MX-AAAA-BBBB",
      p_user: USER.id,
      p_stripe_subscription_id: "sub_test_1",
    });
    const [couponParams, couponOpts] = stripe.coupons.create.mock.calls[0];
    expect(couponParams).toMatchObject({ percent_off: 100, duration: "repeating", duration_in_months: 3, max_redemptions: 1 });
    expect(couponOpts).toEqual({ idempotencyKey: "matrx-free-months-coupon-red-1" });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      "sub_test_1",
      { discounts: [{ discount: "di_existing" }, { discount: "di_obj" }, { coupon: "stripe_coupon_1" }] },
      { idempotencyKey: "matrx-free-months-apply-red-1" },
    );
    expect(adminRpc).toHaveBeenNthCalledWith(2, "coupon_claim_settle", {
      p_redemption_id: "red-1",
      p_stripe_coupon_id: "stripe_coupon_1",
    });
  });

  it("releases the claim and deletes the half-made Stripe coupon when applying it fails", async () => {
    subscriptionRow = { stripe_subscription_id: "sub_test_1", cancel_at_period_end: false };
    adminRpc.mockImplementation(async (fn: string) =>
      fn === "coupon_claim_for_subscription"
        ? { data: { redemption_id: "red-2", coupon_id: "cou-2", months: 1 }, error: null }
        : { data: { status: "released" }, error: null },
    );
    stripe.coupons.create.mockResolvedValue({ id: "stripe_coupon_2" });
    stripe.subscriptions.retrieve.mockResolvedValue({ discounts: [] });
    stripe.subscriptions.update.mockRejectedValue(new Error("card_declined"));

    const res = await POST(req({ code: "MX-AAAA-BBBB" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("coupon_stripe_failed");
    expect(stripe.coupons.del).toHaveBeenCalledWith("stripe_coupon_2");
    expect(adminRpc).toHaveBeenLastCalledWith("coupon_claim_settle", {
      p_redemption_id: "red-2",
      p_stripe_coupon_id: "stripe_coupon_2",
      p_error: "card_declined",
    });
  });

  it("never calls Stripe when the claim is refused", async () => {
    subscriptionRow = { stripe_subscription_id: "sub_test_1", cancel_at_period_end: false };
    adminRpc.mockResolvedValue({ data: null, error: { message: "coupon_expired", details: "This coupon expired on 2026-10-01." } });
    const res = await POST(req({ code: "MX-AAAA-BBBB" }));
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("coupon_expired");
    expect(stripe.coupons.create).not.toHaveBeenCalled();
  });
});
