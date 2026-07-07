// app/api/stripe/webhook/route.ts
//
// POST /api/stripe/webhook — the ONE inbound sync from Stripe → billing.*.
// Signature-verified (raw body), idempotent (billing.stripe_event), every event
// logged. Writes go through the admin client (service_role) — the only write
// path to billing tables (RLS denies authenticated writes).
//
// UNTESTED pending Stripe TEST keys + a webhook secret (STRIPE_WEBHOOK_SECRET).
// Verify with `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getWebhookSecret } from "@/lib/stripe/server";
import {
  hasProcessedStripeEvent,
  recordStripeEvent,
  markSubscriptionCanceled,
  syncSubscription,
} from "@/features/entitlements/stripe/sync";

// Stripe requires the raw request body for signature verification — never parse
// it as JSON first.
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      getWebhookSecret(),
    );
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency — Stripe retries; skip anything already fully processed.
  if (await hasProcessedStripeEvent(event.id)) {
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.trial_will_end":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await markSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;
      case "checkout.session.completed": {
        // The subscription.* events carry the full object; re-sync from the
        // session's subscription to be safe if it arrives first.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await getStripe().subscriptions.retrieve(subId);
          await syncSubscription(sub);
        }
        break;
      }
      default:
        // Recorded below but not acted on — safe to ignore.
        break;
    }
    await recordStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[stripe/webhook] handler error for ${event.type}`, err);
    // 500 => Stripe retries; the event was recorded but we let it re-fire so a
    // transient DB error self-heals. (claimStripeEvent already inserted the id,
    // so a retry would dedupe — acceptable: we prefer no double-charge risk over
    // a missed sync, and subscription.* events are also re-emitted by Stripe.)
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
