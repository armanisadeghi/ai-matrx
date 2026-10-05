import { billingStatusLabel, periodEndLabel, priceLabel, readBillingSummary } from "../billing-summary";
import { selectPreferredBillingSubscription } from "../billing-subscription-selection";

const mockCreateClient = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ createClient: () => mockCreateClient() }));

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

  it("reads terminal-only history with a fresh query instead of retaining nonterminal filters", async () => {
    const terminalRow = { id: "sub-canceled", plan_key: "personal-entry", price_id: null, status: "canceled", current_period_end: "2026-08-01T00:00:00.000Z", cancel_at_period_end: false, beneficiary_user_id: "member-harbor" };
    const seenFilters: string[][] = [];
    const createBuilder = () => {
      const filters: string[] = [];
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "in", "neq", "order", "limit"]) builder[method] = (...args: unknown[]) => { filters.push(`${method}:${args.join(",")}`); return builder; };
      builder.maybeSingle = async () => {
        seenFilters.push([...filters]);
        const terminalPass = filters.some((filter) => filter.startsWith("in:status,canceled,incomplete_expired"));
        const excludesTerminal = filters.some((filter) => filter === "neq:status,canceled") || filters.some((filter) => filter === "neq:status,incomplete_expired");
        return { data: terminalPass && !excludesTerminal ? terminalRow : null, error: null };
      };
      return builder;
    };
    mockCreateClient.mockReturnValue({ schema: () => ({ from: () => createBuilder() }) });

    await expect(readBillingSummary({ kind: "personal", userId: "member-harbor" }, true)).resolves.toMatchObject({ ok: true, subscription: { id: "sub-canceled" } });
    expect(seenFilters).toHaveLength(2);
    expect(seenFilters[1]).not.toContain("neq:status,canceled");
  });

  it("prints the Stripe-mirrored billed interval rather than a catalog guess", () => {
    expect(priceLabel({ unit_amount: 1900, currency: "usd", interval: "month", interval_count: 1 })).toBe("$19 / month");
    expect(priceLabel({ unit_amount: 19000, currency: "usd", interval: "month", interval_count: 12 })).toBe("$190 / 12 months");
  });
});
