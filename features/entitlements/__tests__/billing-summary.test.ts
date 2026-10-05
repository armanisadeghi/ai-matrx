import { billingStatusLabel, periodEndLabel, priceLabel } from "../billing-summary";

describe("billing summary presentation contract", () => {
  it("names payment-recovery states without calling them active", () => {
    expect(billingStatusLabel("past_due")).toBe("Payment due");
    expect(billingStatusLabel("incomplete")).toBe("Payment pending");
  });

  it("does not call a scheduled cancellation a renewal", () => {
    expect(periodEndLabel(true)).toBe("Ends");
    expect(periodEndLabel(false)).toBe("Renews");
  });

  it("prints the Stripe-mirrored billed interval rather than a catalog guess", () => {
    expect(priceLabel({ unit_amount: 1900, currency: "usd", interval: "month", interval_count: 1 })).toBe("$19 / month");
    expect(priceLabel({ unit_amount: 19000, currency: "usd", interval: "month", interval_count: 12 })).toBe("$190 / 12 months");
  });
});
