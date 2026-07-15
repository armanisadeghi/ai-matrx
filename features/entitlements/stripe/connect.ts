// features/entitlements/stripe/connect.ts
//
// Server-only write path for the Stripe Connect (creator payouts) tables. Mirrors
// sync.ts: runs with the admin (service_role) client, which is the ONLY writer to
// billing.connect_account / billing.class_purchase (both are RLS deny-by-default).
// Every function is idempotent so Stripe's at-least-once webhook retries never
// double-apply. Never import into client code.

import type Stripe from "stripe";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { getStripe } from "@/lib/stripe/server";

export interface ConnectAccountRow {
  userId: string;
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  country: string | null;
  defaultCurrency: string | null;
  onboardedAt: string | null;
}

/** The caller's connect_account row (admin read), or null if never connected. */
export async function getConnectAccountByUser(
  userId: string,
): Promise<ConnectAccountRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .schema("billing")
    .from("connect_account")
    .select(
      "user_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, country, default_currency, onboarded_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    userId: data.user_id,
    stripeAccountId: data.stripe_account_id,
    chargesEnabled: data.charges_enabled,
    payoutsEnabled: data.payouts_enabled,
    detailsSubmitted: data.details_submitted,
    country: data.country,
    defaultCurrency: data.default_currency,
    onboardedAt: data.onboarded_at,
  };
}

/** The app user that owns a Stripe connected account id (reverse lookup). */
export async function userIdForConnectAccount(
  stripeAccountId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .schema("billing")
    .from("connect_account")
    .select("user_id")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/**
 * Ensure a Stripe Express connected account exists for a creator and its mapping
 * row is stored. Returns the stripe_account_id. Reuses an existing account (never
 * mints a duplicate). Requires Connect to be enabled on the platform account.
 */
export async function ensureConnectAccount(
  userId: string,
  email: string | null,
): Promise<string> {
  const existing = await getConnectAccountByUser(userId);
  if (existing) return existing.stripeAccountId;

  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    email: email ?? undefined,
    capabilities: { transfers: { requested: true } },
    business_type: "individual",
    metadata: { user_id: userId },
  });

  await upsertConnectAccount(userId, account);
  return account.id;
}

/**
 * Upsert the local mirror of a Stripe account's onboarding state. Sets
 * onboarded_at the first time charges are enabled. Idempotent on user_id.
 */
export async function upsertConnectAccount(
  userId: string,
  account: Stripe.Account,
): Promise<void> {
  const admin = createAdminClient();
  const prior = await getConnectAccountByUser(userId);
  const nowCharges = account.charges_enabled ?? false;
  const onboardedAt =
    prior?.onboardedAt ?? (nowCharges ? new Date().toISOString() : null);

  await admin
    .schema("billing")
    .from("connect_account")
    .upsert(
      {
        user_id: userId,
        stripe_account_id: account.id,
        charges_enabled: nowCharges,
        payouts_enabled: account.payouts_enabled ?? false,
        details_submitted: account.details_submitted ?? false,
        country: account.country ?? null,
        default_currency: account.default_currency ?? null,
        onboarded_at: onboardedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
}

/**
 * Refresh a creator's Connect status from Stripe (retrieve → upsert mirror).
 * Called by the status route so the dashboard reflects live onboarding progress
 * without waiting on the account.updated webhook. Returns the fresh row.
 */
export async function refreshConnectAccount(
  userId: string,
): Promise<ConnectAccountRow | null> {
  const row = await getConnectAccountByUser(userId);
  if (!row) return null;
  const account = await getStripe().accounts.retrieve(row.stripeAccountId);
  await upsertConnectAccount(userId, account);
  return getConnectAccountByUser(userId);
}

// ─── Paid-class purchases (the sales ledger) ────────────────────────────────────

export interface PendingPurchaseInput {
  buyerUserId: string;
  classId: string;
  creatorUserId: string;
  organizationId: string | null;
  stripeCheckoutSessionId: string;
  stripeAccountId: string;
  amountTotal: number;
  applicationFeeAmount: number;
  creatorAmount: number;
  currency: string;
}

/** Insert the pending sales row at checkout-session creation time. */
export async function recordPendingPurchase(
  input: PendingPurchaseInput,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .schema("billing")
    .from("class_purchase")
    .upsert(
      {
        buyer_user_id: input.buyerUserId,
        class_id: input.classId,
        creator_user_id: input.creatorUserId,
        organization_id: input.organizationId,
        stripe_checkout_session_id: input.stripeCheckoutSessionId,
        stripe_account_id: input.stripeAccountId,
        amount_total: input.amountTotal,
        application_fee_amount: input.applicationFeeAmount,
        creator_amount: input.creatorAmount,
        currency: input.currency,
        status: "pending",
      },
      { onConflict: "stripe_checkout_session_id" },
    );
}

/**
 * Mark a purchase paid and confer the enrolment (the WEBHOOK-ONLY paid gate).
 * Looks the sale up by checkout session, records the payment_intent (the refund
 * lookup key), then calls the service_role-only edu_class_confer_purchase RPC.
 * Idempotent — a Stripe retry re-runs an upsert + a no-op confer. Returns false
 * (loudly) when no pending sale matches the session (a defect worth investigating).
 */
export async function fulfillClassPurchase(
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  const admin = createAdminClient();
  const sessionId = session.id;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const { data: sale } = await admin
    .schema("billing")
    .from("class_purchase")
    .select("id, class_id, buyer_user_id, status")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();

  if (!sale) {
    console.error(
      `[stripe/connect] LOUD: checkout.session.completed for ${sessionId} has no ` +
        `pending billing.class_purchase row — enrolment cannot be conferred. ` +
        `The pending row is written at checkout creation; investigate.`,
    );
    return false;
  }

  await admin
    .schema("billing")
    .from("class_purchase")
    .update({
      status: "paid",
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sale.id);

  // Confer the enrolment via the service_role-only RPC (the ONLY grant path).
  const { error } = await admin.rpc("edu_class_confer_purchase", {
    p_class: sale.class_id,
    p_user: sale.buyer_user_id,
  });
  if (error) {
    console.error(
      `[stripe/connect] LOUD: edu_class_confer_purchase failed for sale ${sale.id} ` +
        `(class ${sale.class_id}, buyer ${sale.buyer_user_id}): ${error.message}`,
    );
    throw new Error(error.message); // 500 → Stripe retries; the upsert above is idempotent
  }
  return true;
}

/**
 * A refund or chargeback pulls access. Finds the sale by payment_intent, revokes
 * the enrolment (service_role-only RPC), and marks the ledger row. Idempotent.
 */
export async function revokeClassPurchaseByPaymentIntent(
  paymentIntentId: string,
  reason: "refunded" | "disputed",
): Promise<void> {
  const admin = createAdminClient();
  const { data: sale } = await admin
    .schema("billing")
    .from("class_purchase")
    .select("id, class_id, buyer_user_id, status")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!sale) return; // not one of ours (e.g. a subscription payment)

  const { error } = await admin.rpc("edu_class_revoke_purchase", {
    p_class: sale.class_id,
    p_user: sale.buyer_user_id,
  });
  if (error) {
    console.error(
      `[stripe/connect] LOUD: edu_class_revoke_purchase failed for sale ${sale.id}: ${error.message}`,
    );
    throw new Error(error.message);
  }

  await admin
    .schema("billing")
    .from("class_purchase")
    .update({
      status: reason,
      refunded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sale.id);
}
