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
import {
  COPPA_VERIFICATION_PURPOSE,
  confirmCoppaVerification,
} from "@/features/education/compliance/consent/verificationSync";
import {
  fulfillClassPurchase,
  revokeClassPurchaseByPaymentIntent,
  upsertConnectAccount,
  userIdForConnectAccount,
} from "@/features/entitlements/stripe/connect";

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
        await syncSubscription(event.data.object as Stripe.Subscription, event.created);
        break;
      case "customer.subscription.deleted":
        await markSubscriptionCanceled(event.data.object as Stripe.Subscription, event.created);
        break;
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // COPPA parental-consent card verification ($0.50 auth-and-void) — a
        // distinct payment-mode flow. Branch FIRST (before the class-purchase
        // catch-all below) on its own metadata.purpose so it never routes into
        // enrolment fulfilment. Marks the guardian_link verified, server-side.
        if (session.metadata?.purpose === COPPA_VERIFICATION_PURPOSE) {
          await confirmCoppaVerification(session);
          break;
        }
        // Paid-class purchase (Connect destination charge) — confer the enrolment.
        // This is the WEBHOOK-ONLY paid gate: fulfillClassPurchase calls the
        // service_role-only edu_class_confer_purchase RPC. No client can reach it.
        // Keyed strictly on metadata.kind (set on every class-checkout session) —
        // never session.mode, which COPPA verification also uses.
        if (session.metadata?.kind === "class_purchase") {
          await fulfillClassPurchase(session);
          break;
        }
        // Subscription checkout — the subscription.* events carry the full object;
        // re-sync from the session's subscription in case it arrives first.
        if (session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await getStripe().subscriptions.retrieve(subId);
          await syncSubscription(sub, event.created);
        }
        break;
      }
      case "charge.refunded": {
        // A refund pulls class access. Find the sale by payment_intent + revoke.
        const charge = event.data.object as Stripe.Charge;
        const pi =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : (charge.payment_intent?.id ?? null);
        if (pi) await revokeClassPurchaseByPaymentIntent(pi, "refunded");
        break;
      }
      case "charge.dispute.created": {
        // A chargeback pulls class access too.
        const dispute = event.data.object as Stripe.Dispute;
        const pi =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : (dispute.payment_intent?.id ?? null);
        if (pi) await revokeClassPurchaseByPaymentIntent(pi, "disputed");
        break;
      }
      case "account.updated": {
        // Keep the creator's Connect onboarding state fresh (charges_enabled, …).
        const account = event.data.object as Stripe.Account;
        const ownerId =
          (account.metadata?.user_id as string | undefined) ??
          (await userIdForConnectAccount(account.id));
        if (ownerId) await upsertConnectAccount(ownerId, account);
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
    // 500 => Stripe retries. The event id is recorded only AFTER a successful
    // handler (record-after), so a failed event is NOT marked processed and the
    // retry re-runs it. Handlers are idempotent upserts, so the retry is safe.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
