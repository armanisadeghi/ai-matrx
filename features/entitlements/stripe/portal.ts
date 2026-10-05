import { getStripe } from "@/lib/stripe/server";

/** A personal subscriber can change personal plans, never purchase company
 * seats through a portal whose webhook would attribute them to one person. */
export async function openSubscriptionPortal(customer: string, personal: boolean, returnUrl: string) {
  const stripe = getStripe();
  const configuration = await subscriptionPortalConfiguration(personal);
  if (!configuration) throw new Error("Subscription billing portal is not configured");
  return stripe.billingPortal.sessions.create({ customer, configuration: configuration.id, return_url: returnUrl });
}

export async function subscriptionPortalConfiguration(personal: boolean) {
  const configurations = await getStripe().billingPortal.configurations.list({ active: true, limit: 100 });
  return configurations.data.find((c) => c.metadata?.purpose === "platform_subscription"
    && c.metadata.audience === (personal ? "personal" : "company"));
}
