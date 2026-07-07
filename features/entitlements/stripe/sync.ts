// features/entitlements/stripe/sync.ts
//
// The ONE write path from Stripe → the billing.* tables. Runs server-side with
// the admin (service_role) client, which bypasses the deny-by-default RLS on
// billing tables (protected-resources posture: no authenticated write path
// exists; webhooks are the only writer). Every function here is idempotent so
// Stripe's at-least-once retries never double-apply.

import type Stripe from "stripe";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { getStripe } from "@/lib/stripe/server";
import type { Database } from "@/types/database.types";

type SubStatus = Database["billing"]["Enums"]["subscription_status"];
type Tier = Database["billing"]["Enums"]["tier"];

/** Stripe subscription.status → billing.subscription_status (identical vocab). */
function mapStatus(s: Stripe.Subscription.Status): SubStatus {
  // Stripe statuses map 1:1 to our enum except none are missing; cast is safe
  // because the enum was defined to mirror Stripe's set.
  return s as SubStatus;
}

function iso(unixSeconds: number | null | undefined): string | null {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

/**
 * Ensure a Stripe customer exists for a user and the mapping row is stored.
 * Returns the stripe_customer_id.
 */
export async function ensureStripeCustomer(
  userId: string,
  email: string | null,
): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .schema("billing")
    .from("customer")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { user_id: userId },
  });
  await admin
    .schema("billing")
    .from("customer")
    .upsert(
      { user_id: userId, stripe_customer_id: customer.id },
      { onConflict: "user_id" },
    );
  return customer.id;
}

/** Find the app user for a Stripe customer id (via the mapping table). */
export async function userIdForCustomer(
  customerId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .schema("billing")
    .from("customer")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/** Resolve our price row + product tier for a Stripe price id. */
async function tierForStripePrice(
  stripePriceId: string | null,
): Promise<{ priceId: string | null; tier: Tier }> {
  if (!stripePriceId) return { priceId: null, tier: "premium" };
  const admin = createAdminClient();
  const { data } = await admin
    .schema("billing")
    .from("price")
    .select("id, product:product_id(tier)")
    .eq("stripe_price_id", stripePriceId)
    .maybeSingle();
  const tier = (data?.product as { tier?: Tier } | null)?.tier ?? "premium";
  return { priceId: data?.id ?? null, tier };
}

/**
 * Has an event NEWER than `eventCreatedUnix` already been applied to this
 * subscription? Stripe does not guarantee delivery order and retries freely, so
 * a retried OLD event must not overwrite newer state (e.g. an old `active`
 * clobbering a newer `canceled`). Returns true when the incoming event is stale.
 */
async function isStaleSubscriptionEvent(
  stripeSubscriptionId: string,
  eventCreatedUnix: number | null | undefined,
): Promise<boolean> {
  if (!eventCreatedUnix) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .schema("billing")
    .from("subscription")
    .select("last_stripe_event_at")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  const last = data?.last_stripe_event_at;
  return Boolean(last && new Date(last).getTime() > eventCreatedUnix * 1000);
}

/**
 * Upsert a billing.subscription row from a Stripe subscription. Idempotent on
 * stripe_subscription_id. `trialing` status resolves the user to the `trial`
 * tier. Pass the event's `created` timestamp so out-of-order retries are ignored.
 */
export async function syncSubscription(
  sub: Stripe.Subscription,
  eventCreatedUnix?: number,
): Promise<void> {
  if (await isStaleSubscriptionEvent(sub.id, eventCreatedUnix)) return;

  const admin = createAdminClient();
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Resolve the app user; fall back to metadata, then scream (a paid customer
  // with no owner grants premium to nobody — a defect, per the loud-recovery rule).
  let userId = await userIdForCustomer(customerId);
  if (!userId) userId = (sub.metadata?.user_id as string | undefined) ?? null;
  if (!userId) {
    console.error(
      `[stripe/sync] LOUD: subscription ${sub.id} (customer ${customerId}) has no ` +
        `resolvable app user — premium will grant to nobody. Check billing.customer mapping.`,
    );
  }

  // Period fields live on the subscription ITEM in Stripe SDK v22, not the
  // subscription itself (reading sub.current_period_* yields undefined -> null).
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const { priceId: localPriceId, tier } = await tierForStripePrice(priceId);

  await admin
    .schema("billing")
    .from("subscription")
    .upsert(
      {
        stripe_subscription_id: sub.id,
        user_id: userId,
        price_id: localPriceId,
        status: mapStatus(sub.status),
        tier: sub.status === "trialing" ? "trial" : tier,
        current_period_start: iso(item?.current_period_start),
        current_period_end: iso(item?.current_period_end),
        cancel_at_period_end: sub.cancel_at_period_end,
        canceled_at: iso(sub.canceled_at),
        trial_start: iso(sub.trial_start),
        trial_end: iso(sub.trial_end),
        last_stripe_event_at: eventCreatedUnix
          ? new Date(eventCreatedUnix * 1000).toISOString()
          : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );
}

/** Mark a subscription canceled (subscription.deleted). Idempotent + order-safe. */
export async function markSubscriptionCanceled(
  sub: Stripe.Subscription,
  eventCreatedUnix?: number,
): Promise<void> {
  if (await isStaleSubscriptionEvent(sub.id, eventCreatedUnix)) return;
  const admin = createAdminClient();
  await admin
    .schema("billing")
    .from("subscription")
    .update({
      status: "canceled",
      canceled_at: iso(sub.canceled_at) ?? new Date().toISOString(),
      last_stripe_event_at: eventCreatedUnix
        ? new Date(eventCreatedUnix * 1000).toISOString()
        : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", sub.id);
}

/**
 * Has this Stripe event already been fully processed? Checked BEFORE handling
 * so a retry of a transiently-failed event re-runs (the id is only recorded
 * AFTER a successful handler — see recordStripeEvent). The handlers are
 * idempotent upserts, so the small window where two concurrent deliveries both
 * process is harmless.
 */
export async function hasProcessedStripeEvent(
  eventId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .schema("billing")
    .from("stripe_event")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();
  return Boolean(data);
}

/** Record an event id AFTER its handler succeeded (idempotency marker). */
export async function recordStripeEvent(event: Stripe.Event): Promise<void> {
  const admin = createAdminClient();
  await admin
    .schema("billing")
    .from("stripe_event")
    .upsert({ id: event.id, type: event.type }, { onConflict: "id" });
}
