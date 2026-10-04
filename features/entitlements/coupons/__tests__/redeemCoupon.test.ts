/**
 * THE REDEEM CALL HAPPENS EXACTLY ONCE PER CODE.
 * /redeem auto-redeems on mount; a React dev double effect, a remount or a
 * second click must not send a second request (it would answer "already
 * redeemed" and hide the real result).
 */
import { __resetRedeemCouponForTests, redeemCoupon } from "../redeemCoupon";

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("redeemCoupon", () => {
  beforeEach(() => __resetRedeemCouponForTests());

  it("sends one POST for repeated calls with the same code", async () => {
    const fetchImpl = jest.fn(async () =>
      okResponse({ mode: "grant", result: { grant: { plan_key: "pro", ends_at: "2027-03-04T12:00:00Z" } } }),
    );
    const [a, b] = await Promise.all([redeemCoupon("TOKEN-1", fetchImpl), redeemCoupon("TOKEN-1", fetchImpl)]);
    const c = await redeemCoupon(" TOKEN-1 ", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/api/billing/coupons/redeem", expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "TOKEN-1" }) }));
    expect(a).toEqual(b);
    expect(c).toEqual(a);
    expect(a.ok && a.line).toMatch(/^Pro free until Mar 4, 2027$/);
  });

  it("renders a database refusal as one line and does not resend", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(JSON.stringify({ error: "coupon_not_new_account", message: "x" }), { status: 409 }),
    );
    const r = await redeemCoupon("TOKEN-2", fetchImpl);
    await redeemCoupon("TOKEN-2", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: false, code: "coupon_not_new_account", line: "This link is for new accounts only." });
  });

  it("a network failure may be retried", async () => {
    const fetchImpl = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(okResponse({ mode: "stripe", months: 3 }));
    const first = await redeemCoupon("TOKEN-3", fetchImpl);
    expect(first.ok).toBe(false);
    await Promise.resolve();
    const second = await redeemCoupon("TOKEN-3", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second).toMatchObject({ ok: true, line: "3 months free on your bill" });
  });
});
