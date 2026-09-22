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
import {
  asRowBag,
  billingOwnerRef,
  billingOwnerRefFromRow,
  ownerEq,
  ownerPayload,
  type BillingOwnerRef,
} from "./billingOwner";

export interface ConnectAccountRow {
  /**
   * REC-62: the owner of the payout account — the ORGANIZATION after the column
   * move, the person before it. Opaque, so a caller passes it straight back into
   * `upsertConnectAccount` without learning which era it is in.
   */
  owner: BillingOwnerRef;
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  country: string | null;
  defaultCurrency: string | null;
  onboardedAt: string | null;
}

/**
 * What Stripe still wants from a connected account, straight off the account
 * object. These lists are NOT mirrored in billing.connect_account and cannot
 * be — they change without a webhook of their own (an ID expires, a threshold
 * is crossed), so the truth is only ever the live account.
 *
 * The codes are Stripe's own developer strings (`individual.verification.document`,
 * `external_account`). They must never reach a screen as-is — translate them
 * with `describeStripeRequirement` in lib/stripe/connect-requirements.ts.
 */
export interface ConnectRequirements {
  /** Needed now — payouts/charges stop if these are not supplied. */
  currentlyDue: string[];
  /** Needed eventually, no deadline yet. */
  eventuallyDue: string[];
  /** The deadline passed. Stripe has already restricted the account. */
  pastDue: string[];
  /** Supplied, Stripe is reviewing. Nothing for the user to do. */
  pendingVerification: string[];
  /** Stripe's machine reason payouts/charges are off, e.g. `requirements.past_due`. */
  disabledReason: string | null;
  /** Unix seconds by which `currentlyDue` must be satisfied, when Stripe set one. */
  currentDeadline: number | null;
}

/** The mirrored row plus the live requirement list it cannot hold. */
export interface ConnectAccountStatus {
  row: ConnectAccountRow;
  /** Null when we could not reach Stripe — NOT the same as "nothing is due". */
  requirements: ConnectRequirements | null;
}

function readRequirements(account: Stripe.Account): ConnectRequirements {
  const r = account.requirements;
  return {
    currentlyDue: r?.currently_due ?? [],
    eventuallyDue: r?.eventually_due ?? [],
    pastDue: r?.past_due ?? [],
    pendingVerification: r?.pending_verification ?? [],
    disabledReason: r?.disabled_reason ?? null,
    currentDeadline: r?.current_deadline ?? null,
  };
}

/** The owner's connect_account row (admin read), or null if never connected. */
export async function getConnectAccount(
  owner: BillingOwnerRef,
): Promise<ConnectAccountRow | null> {
  const admin = createAdminClient();
  const { data } = await ownerEq(
    admin.schema("billing").from("connect_account").select("*"),
    owner,
  ).maybeSingle();
  const row = asRowBag(data);
  if (!row) return null;
  return {
    owner,
    stripeAccountId: row["stripe_account_id"] as string,
    chargesEnabled: Boolean(row["charges_enabled"]),
    payoutsEnabled: Boolean(row["payouts_enabled"]),
    detailsSubmitted: Boolean(row["details_submitted"]),
    country: (row["country"] as string | null) ?? null,
    defaultCurrency: (row["default_currency"] as string | null) ?? null,
    onboardedAt: (row["onboarded_at"] as string | null) ?? null,
  };
}

/** The OWNER of a Stripe connected account id (reverse lookup, webhook path). */
export async function billingOwnerForConnectAccount(
  stripeAccountId: string,
): Promise<BillingOwnerRef | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .schema("billing")
    .from("connect_account")
    .select("*")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();
  return billingOwnerRefFromRow(asRowBag(data));
}

/**
 * Ensure a Stripe Express connected account exists for the ORGANIZATION the creator
 * is acting in and its mapping row is stored. Returns the stripe_account_id. Reuses
 * an existing account (never mints a duplicate). Requires Connect to be enabled on
 * the platform account.
 *
 * REC-62: the payout account belongs to the organization. `billingOwnerRef` refuses
 * rather than substituting one once the column has moved.
 */
export async function ensureConnectAccount(input: {
  userId: string;
  organizationId?: string | null;
  email: string | null;
}): Promise<string> {
  const owner = await billingOwnerRef(input);
  const existing = await getConnectAccount(owner);
  if (existing) return existing.stripeAccountId;

  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    email: input.email ?? undefined,
    capabilities: { transfers: { requested: true } },
    business_type: "individual",
    metadata: { [owner.column]: owner.value, acting_user_id: input.userId },
  });

  await upsertConnectAccount(owner, account);
  return account.id;
}

/**
 * Upsert the local mirror of a Stripe account's onboarding state. Sets
 * onboarded_at the first time charges are enabled. Idempotent on the owner column.
 */
export async function upsertConnectAccount(
  owner: BillingOwnerRef,
  account: Stripe.Account,
): Promise<void> {
  const admin = createAdminClient();
  const prior = await getConnectAccount(owner);
  const nowCharges = account.charges_enabled ?? false;
  const onboardedAt =
    prior?.onboardedAt ?? (nowCharges ? new Date().toISOString() : null);

  await admin
    .schema("billing")
    .from("connect_account")
    .upsert(
      ownerPayload(owner, {
        stripe_account_id: account.id,
        charges_enabled: nowCharges,
        payouts_enabled: account.payouts_enabled ?? false,
        details_submitted: account.details_submitted ?? false,
        country: account.country ?? null,
        default_currency: account.default_currency ?? null,
        onboarded_at: onboardedAt,
        updated_at: new Date().toISOString(),
      }),
      { onConflict: owner.column },
    );
}

/**
 * Refresh a creator's Connect status from Stripe (retrieve → upsert mirror).
 * Called by the status route so the dashboard reflects live onboarding progress
 * without waiting on the account.updated webhook.
 *
 * Returns the fresh row AND the requirement lists off the retrieved account —
 * the whole point of paying for the round trip. Without them the surface can
 * only say "payouts are off"; with them it can name the one document Stripe is
 * waiting for, which is the difference between a dead end and a next step.
 */
export async function refreshConnectAccount(
  owner: BillingOwnerRef,
): Promise<ConnectAccountStatus | null> {
  const row = await getConnectAccount(owner);
  if (!row) return null;
  const account = await getStripe().accounts.retrieve(row.stripeAccountId);
  await upsertConnectAccount(owner, account);
  const fresh = await getConnectAccount(owner);
  if (!fresh) return null;
  return { row: fresh, requirements: readRequirements(account) };
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
  if (input.organizationId === null) {
    throw new Error("This purchase has no organization, so it was not recorded.");
  }
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
    // access-errors: ok — webhook handler; the throw becomes a 500 read by Stripe's retry machinery, never rendered to a person
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
    // access-errors: ok — webhook handler; the throw becomes a 500 read by Stripe's retry machinery, never rendered to a person
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
