import { billingStatusLabel, periodEndLabel, priceLabel } from "../billing-summary";
import { selectPreferredBillingSubscription } from "../billing-subscription-selection";

describe("billing summary presentation contract", () => {
  it("names payment-recovery states without calling them active", () => {
    expect(billingStatusLabel("past_due")).toBe("Payment due");
    expect(billingStatusLabel("incomplete")).toBe("Payment pending");
  });

  it("does not call a scheduled cancellation a renewal", () => {
    expect(periodEndLabel("active", true)).toBe("Ends");
    expect(periodEndLabel("active", false)).toBe("Renews");
  });

  it("does not call an expired subscription a renewal", () => {
    expect(periodEndLabel("incomplete_expired", false)).toBe("Ended");
    expect(periodEndLabel("canceled", false)).toBe("Paid through");
  });

  it("prefers an active monthly replacement over a canceled annual subscription", () => {
    const selected = selectPreferredBillingSubscription([
      { id: "sub-annual", status: "canceled", current_period_end: "2027-01-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z" },
      { id: "sub-monthly", status: "active", current_period_end: "2026-11-01T00:00:00.000Z", updated_at: "2026-10-02T00:00:00.000Z" },
    ]);
    expect(selected?.id).toBe("sub-monthly");
  });

  it("uses the latest paid-through terminal subscription when history is all that remains", () => {
    const selected = selectPreferredBillingSubscription([
      { id: "sub-expired", status: "incomplete_expired", current_period_end: "2026-06-01T00:00:00.000Z", updated_at: "2026-06-01T00:00:00.000Z" },
      { id: "sub-canceled", status: "canceled", current_period_end: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-02T00:00:00.000Z" },
    ]);
    expect(selected?.id).toBe("sub-canceled");
  });

  it("prints the Stripe-mirrored billed interval rather than a catalog guess", () => {
    expect(priceLabel({ unit_amount: 1900, currency: "usd", interval: "month", interval_count: 1 })).toBe("$19 / month");
    expect(priceLabel({ unit_amount: 19000, currency: "usd", interval: "month", interval_count: 12 })).toBe("$190 / 12 months");
  });
});
