import { canConfirmImmediateUpgrade, openImmediateUpgradeConfirmation } from "./planChange";

const create = jest.fn(async (params) => ({ id: "bps_upgrade", url: "https://billing.stripe.test/confirm", ...params }));

const candidate = {
  subscription: { id: "sub_harbor", status: "active" as const, schedule: null, items: { data: [{ id: "si_harbor", quantity: 3 }] } },
  currentPlanRank: 20,
  targetPlanRank: 40,
  targetPriceId: "price_growth_yearly",
  targetQuantity: 3,
};

describe("immediate upgrade confirmation", () => {
  beforeEach(() => { create.mockClear(); });

  it("sends Stripe the selected price, existing item, and quantity for confirmation", async () => {
    await openImmediateUpgradeConfirmation({ ...candidate, customerId: "cus_harbor", configurationId: "bpc_platform_personal", returnUrl: "https://app.matrx.test/pricing", stripe: { billingPortal: { sessions: { create } } } } as never);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus_harbor",
      flow_data: expect.objectContaining({
        type: "subscription_update_confirm",
        subscription_update_confirm: { subscription: "sub_harbor", items: [{ id: "si_harbor", price: "price_growth_yearly", quantity: 3 }] },
        after_completion: { type: "redirect", redirect: { return_url: "https://app.matrx.test/pricing" } },
      }),
    }));
  });

  it("refuses delayed, multi-item, same-rank, and delinquent changes before Stripe is called", () => {
    expect(canConfirmImmediateUpgrade({ ...candidate, subscription: { ...candidate.subscription, status: "past_due" } })).toBe(false);
    expect(canConfirmImmediateUpgrade({ ...candidate, subscription: { ...candidate.subscription, schedule: "sub_sched" } })).toBe(false);
    expect(canConfirmImmediateUpgrade({ ...candidate, targetPlanRank: 20 })).toBe(false);
    expect(canConfirmImmediateUpgrade({ ...candidate, subscription: { ...candidate.subscription, items: { data: [...candidate.subscription.items.data, { id: "si_extra", quantity: 1 }] } } })).toBe(false);
  });
});
