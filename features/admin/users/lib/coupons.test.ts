import {
  couponRedeemable,
  couponStatus,
  draftCouponMessage,
  knobNumber,
  normalizePhone,
  parseFreeMonthsApply,
  parseRecipients,
  refusalText,
  validateMonths,
} from "./coupons";

const base = { revoked_at: null, redeemed_count: 0, max_redemptions: 1, expires_at: null };
const now = new Date("2026-10-04T12:00:00Z");

describe("couponStatus", () => {
  it("is active until used, revoked or past its expiry", () => {
    expect(couponStatus(base, now)).toBe("active");
    expect(couponStatus({ ...base, expires_at: "2026-10-05T00:00:00Z" }, now)).toBe("active");
  });
  it("revoked wins over redeemed and expired", () => {
    expect(couponStatus({ ...base, revoked_at: "2026-10-01T00:00:00Z", redeemed_count: 1, expires_at: "2026-01-01T00:00:00Z" }, now)).toBe("revoked");
  });
  it("one-time: a single redemption uses it up", () => {
    expect(couponStatus({ ...base, redeemed_count: 1 }, now)).toBe("redeemed");
  });
  it("expires at its timestamp", () => {
    expect(couponStatus({ ...base, expires_at: "2026-10-04T12:00:00Z" }, now)).toBe("expired");
  });
});

describe("parseRecipients", () => {
  it("splits lines, commas and semicolons; emails lowercased, phones to E.164, dupes dropped", () => {
    const { recipients, invalid } = parseRecipients("A@Example.com, (949) 807-2145\n+1 949 666 2578; a@example.com\n9498072145");
    expect(recipients).toEqual([{ email: "a@example.com" }, { phone: "+19498072145" }, { phone: "+19496662578" }]);
    expect(invalid).toEqual([]);
  });
  it("names what it could not read instead of dropping it", () => {
    expect(parseRecipients("bob@, 12345, ok@x.io").invalid).toEqual(["bob@", "12345"]);
  });
});

describe("normalizePhone", () => {
  it("handles 10 digits, 11 with leading 1, and explicit +", () => {
    expect(normalizePhone("9498072145")).toBe("+19498072145");
    expect(normalizePhone("1-949-807-2145")).toBe("+19498072145");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("555")).toBeNull();
  });
});

describe("couponRedeemable + draftCouponMessage", () => {
  it("an existing-account coupon is its code; a new-account one is the full one-time link", () => {
    expect(couponRedeemable({ kind: "existing_account", code: "MX-AAAA-BBBB", link_path: null }, "https://x.io")).toBe("MX-AAAA-BBBB");
    expect(couponRedeemable({ kind: "new_account", code: "MX-C", link_path: "/sign-up?coupon=tok" }, "https://x.io")).toBe("https://x.io/sign-up?coupon=tok");
    expect(couponRedeemable({ kind: "new_account", code: "MX-C", link_path: null }, "https://x.io")).toBeNull();
  });
  it("the draft carries the code or link, plan and months", () => {
    const code = draftCouponMessage({ kind: "existing_account", redeemable: "MX-AAAA-BBBB", planName: "Pro", months: 3, origin: "https://x.io" });
    expect(code).toContain("MX-AAAA-BBBB");
    expect(code).toContain("3 months");
    expect(code).toContain("Pro");
    const link = draftCouponMessage({ kind: "new_account", redeemable: "https://x.io/sign-up?coupon=t", planName: "Pro", months: 1, origin: "https://x.io" });
    expect(link).toContain("https://x.io/sign-up?coupon=t");
    expect(link).toContain("1 month ");
  });
});

describe("validateMonths", () => {
  it("is 1..cap whole months — the cap is the live knob value", () => {
    expect(validateMonths(1, 12)).toBeNull();
    expect(validateMonths(12, 12)).toBeNull();
    expect(validateMonths(13, 12)).toBe("At most 12 months");
    expect(validateMonths(0, 12)).toBe("At least 1 month");
    expect(validateMonths(1.5, 12)).toBe("At least 1 month");
  });
});

describe("knobNumber", () => {
  it("reads JSON numbers and numeric strings, else the fallback", () => {
    expect(knobNumber(12)).toBe(12);
    expect(knobNumber("500")).toBe(500);
    expect(knobNumber(null)).toBeNull();
    expect(knobNumber({ v: 1 }, 3)).toBe(3);
  });
});

describe("parseFreeMonthsApply + refusalText", () => {
  it("keeps per-person outcomes and the database's own refusal words", () => {
    const out = parseFreeMonthsApply({
      applied: 1,
      failed: 1,
      results: [
        { user_id: "a", ok: true, has_live_subscription: false, grant: { plan_key: "pro", requested_plan_key: "pro", ends_at: "2027-01-04T00:00:00Z", capped: false } },
        { user_id: "b", ok: false, has_live_subscription: false, error: "free_time_cap_reached", detail: "This account already holds free time to 2027-10-04, the 12-month ceiling." },
      ],
    });
    expect(out.applied).toBe(1);
    expect(out.failed).toBe(1);
    expect(refusalText(out.results[1])).toMatch(/12-month ceiling/);
    expect(refusalText({ error: "free_time_bad_plan", detail: null })).toBe("free_time_bad_plan");
  });
});
