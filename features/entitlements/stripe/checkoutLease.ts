import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/adminClient";

export class CheckoutBusyError extends Error {}

/** Serialize even different-plan requests for the same Stripe customer. */
export async function withCheckoutLease<T>(
  customer: string,
  livemode: boolean,
  work: (assertHeld: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const db = createAdminClient().schema("billing");
  const args = {
    p_customer: customer,
    p_livemode: livemode,
    p_token: randomUUID(),
  };
  const claim = await db.rpc("claim_checkout", args);
  if (claim.error) throw claim.error;
  if (!claim.data)
    throw new CheckoutBusyError(
      "Checkout is already opening. Please try again shortly.",
    );
  const assertHeld = async () => {
    const renewed = await db.rpc("renew_checkout", args);
    if (renewed.error) throw renewed.error;
    if (!renewed.data)
      throw new CheckoutBusyError("Checkout expired. Please try again.");
  };
  try {
    return await work(assertHeld);
  } finally {
    // A cleanup outage must not erase an already-created checkout URL. The
    // lease expires automatically, and its matching token prevents stale release.
    try {
      const release = await db.rpc("release_checkout", args);
      if (release.error)
        console.error("[stripe/checkout] lease release failed", release.error);
    } catch (error) {
      console.error("[stripe/checkout] lease release failed", error);
    }
  }
}
