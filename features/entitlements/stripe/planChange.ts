import Stripe from "stripe";

export type UpgradeCandidate = {
  subscription: Pick<Stripe.Subscription, "id" | "status" | "schedule"> & {
    items: { data: Array<Pick<Stripe.SubscriptionItem, "id" | "quantity">> };
  };
  currentPlanRank: number;
  targetPlanRank: number;
  targetPriceId: string;
  targetQuantity: number;
};

export function canConfirmImmediateUpgrade(candidate: UpgradeCandidate): boolean {
  return ["active", "trialing"].includes(candidate.subscription.status)
    && candidate.subscription.schedule === null
    && candidate.subscription.items.data.length === 1
    && candidate.targetPlanRank > candidate.currentPlanRank
    && candidate.targetQuantity > 0;
}

/** Opens Stripe's confirmation-only portal flow; it never updates a subscription itself. */
export async function openImmediateUpgradeConfirmation(input: UpgradeCandidate & {
  customerId: string;
  configurationId: string;
  returnUrl: string;
  stripe: Pick<Stripe, "billingPortal">;
}): Promise<Stripe.BillingPortal.Session | null> {
  if (!canConfirmImmediateUpgrade(input)) return null;
  const item = input.subscription.items.data[0];
  return input.stripe.billingPortal.sessions.create({
    customer: input.customerId,
    configuration: input.configurationId,
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: input.subscription.id,
        items: [{ id: item.id, price: input.targetPriceId, quantity: input.targetQuantity }],
      },
      after_completion: { type: "redirect", redirect: { return_url: input.returnUrl } },
    },
  });
}
