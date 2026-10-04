/**
 * A NEW-ACCOUNT COUPON SURVIVES EVERY HOP OF SIGN-UP.
 *
 * `/sign-up?coupon=<token>` becomes the destination `/redeem?code=<token>`; each
 * step below is the real primitive the auth flow uses for that hop. If any of
 * them drops the coupon, the person signs up and never gets their free time.
 */
import {
  authDestinationOr,
  preserveAuthDestination,
  readAuthDestination,
} from "@/utils/auth/auth-destination";
import {
  couponAwareDestination,
  couponFromRedeemPath,
  couponRedeemPath,
  readCouponToken,
} from "@/utils/auth/coupon-links";

const TOKEN = "tK3-ab_cdEFgh12345678901234567890abcdEF";

describe("coupon link token persistence", () => {
  it("first visit: ?coupon= becomes the /redeem destination", () => {
    const params = { coupon: TOKEN };
    expect(couponAwareDestination(params)).toBe(couponRedeemPath(TOKEN));
    expect(readCouponToken(params)).toBe(TOKEN);
  });

  it("an explicit destination still wins over the coupon", () => {
    expect(couponAwareDestination({ coupon: TOKEN, redirectTo: "/tasks" })).toBe("/tasks");
  });

  it("form post → error re-render keeps the coupon (only redirectTo survives)", () => {
    const form = new FormData();
    form.set("redirectTo", couponAwareDestination({ coupon: TOKEN }) ?? "");
    const errorUrl = preserveAuthDestination("/sign-up", form, { error: "Passwords do not match" });
    const back = new URL(errorUrl, "http://x").searchParams;
    expect(back.get("coupon")).toBeNull();
    expect(readCouponToken(back)).toBe(TOKEN);
  });

  it("email confirmation link → /auth/confirm hands back /redeem?code=", () => {
    const form = new FormData();
    form.set("redirectTo", couponRedeemPath(TOKEN));
    const dest = authDestinationOr(form);
    const confirmUrl = `https://aimatrx.com/auth/confirm?redirectTo=${encodeURIComponent(dest)}`;
    const landed = readAuthDestination(new URL(confirmUrl).searchParams);
    expect(couponFromRedeemPath(landed)).toBe(TOKEN);
  });

  it("an authed visitor on /sign-up?coupon= is forwarded to /redeem (middleware fallback)", () => {
    const params = new URLSearchParams({ coupon: TOKEN });
    expect(readAuthDestination(params)).toBeNull();
    expect(couponAwareDestination(params)).toBe(`/redeem?code=${TOKEN}`);
  });

  it("drops a value that is not token-shaped", () => {
    expect(readCouponToken({ coupon: "<script>" })).toBeNull();
    expect(couponAwareDestination({ coupon: "a b" })).toBeNull();
  });
});
