// Stripe invoice events are a recovery signal, not a second financial ledger.
// The invoice carries a subscription reference in the Stripe v22 parent shape;
// always retrieve the subscription before mirroring so the current Stripe state
// wins over an event snapshot that may have arrived late.

import type Stripe from "stripe";

export function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

export async function retrieveSubscriptionForInvoice(
  stripe: Pick<Stripe, "subscriptions">,
  invoice: Stripe.Invoice,
): Promise<Stripe.Subscription | null> {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return null;
  return stripe.subscriptions.retrieve(subscriptionId);
}
