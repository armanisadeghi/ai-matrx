import { formatOfferingPrice, priceProblems } from "./vocabulary";

describe("offering price", () => {
  it("shows amount, currency and unit", () => {
    expect(formatOfferingPrice({ amount: 199, currency: "USD", unit: "per_month" })).toBe("199 USD · Per month");
    expect(formatOfferingPrice({ amount: 12.5, currency: "EUR", unit: null })).toBe("12.50 EUR");
    expect(formatOfferingPrice({ amount: 0, currency: null, unit: "starting_at" })).toBe("0 USD · Starting at");
  });
  it("shows nothing when no price is published", () => {
    expect(formatOfferingPrice(undefined)).toBeNull();
    expect(formatOfferingPrice({ amount: null, currency: "USD", unit: null })).toBeNull();
  });
  it("only complains when an amount is typed", () => {
    expect(priceProblems("", "")).toEqual({ amount: false, currency: false });
    expect(priceProblems("abc", "USD").amount).toBe(true);
    expect(priceProblems("-1", "USD").amount).toBe(true);
    expect(priceProblems("10", "US").currency).toBe(true);
    expect(priceProblems("10", "USD")).toEqual({ amount: false, currency: false });
  });
});
