// app/api/stripe/checkout/route.ts
//
// POST /api/stripe/checkout — create a Stripe Checkout session for the authed
// user and a given price. Legitimate Next.js API-route surface (Stripe SDK).
//
// UNTESTED pending Stripe TEST keys (.env.local currently holds live keys). Do
// not exercise against live keys.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { getStripe, isStripeConfigured, requiredStripeMode } from "@/lib/stripe/server";
import { ensureStripeCustomer } from "@/features/entitlements/stripe/sync";
import { openSubscriptionPortal } from "@/features/entitlements/stripe/portal";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { readRequestOrganizationId } from "@/features/entitlements/stripe/billingOwner";
import {
  billingOrganizationRequiredResponse,
  isBillingOrganizationRequiredError,
} from "@/features/entitlements/stripe/billingOwnerRoute";

export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Billing is not configured yet." },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await getClaimsUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      priceId?: string;
      planKey?: string;
      cycle?: "monthly" | "annual";
      successUrl?: string;
      cancelUrl?: string;
    };
    if (!body.priceId && !body.planKey) {
      return NextResponse.json({ error: "Choose a plan." }, { status: 400 });
    }

    // Resolve the Stripe price id from our mirror (never trust a client-sent
    // Stripe price id blindly — it must exist + be active in billing.price).
    const admin = createAdminClient();
    const livemode = requiredStripeMode() === "live";
    const cycle = body.cycle ?? "monthly";
    if (cycle !== "monthly" && cycle !== "annual") return NextResponse.json({ error: "Choose monthly or annual billing." }, { status: 400 });
    const { data: plan, error: planError } = body.planKey ? await admin.schema("billing").from("plan")
      .select("plan_key,organization_id,audience,monthly_cents,annual_cents,per_seat,min_seats")
      .eq("plan_key", body.planKey).eq("active", true).is("deleted_at", null).single() : { data: null, error: null };
    if (planError || (body.planKey && !plan)) return NextResponse.json({ error: "This plan is unavailable." }, { status: 404 });
    const amount = plan ? cycle === "monthly" ? plan.monthly_cents : plan.annual_cents == null ? null : plan.annual_cents * 12 : null;
    if (plan && (!amount || amount < 0)) return NextResponse.json({ error: "This plan does not require checkout." }, { status: 400 });
    const priceQuery = admin
      .schema("billing")
      .from("price")
      .select("stripe_price_id, active, trial_period_days, unit_amount, interval, currency, interval_count")
      .eq("livemode", livemode).eq("active", true).is("deleted_at", null).not("metadata->>plan_key", "is", null);
    const { data: price, error: priceError } = await (plan ? priceQuery.contains("metadata", { plan_key: plan.plan_key })
      .eq("interval", cycle === "monthly" ? "month" : "year").eq("unit_amount", amount!)
      : priceQuery.eq("id", body.priceId!)).maybeSingle();
    if (priceError) throw priceError;
    if (!price?.stripe_price_id || !price.active) {
      return NextResponse.json(
        { error: "Unknown or inactive price" },
        { status: 404 },
      );
    }

    const personal = plan?.audience === "personal";
    // Personal contracts are explicitly owned by their catalog's merchant,
    // with the authenticated purchaser as beneficiary. Company contracts use
    // the caller's selected organization; neither path guesses a user's org.
    const organizationId = personal ? plan.organization_id : readRequestOrganizationId(request);
    if (!personal && organizationId) {
      const { data: membership, error } = await supabase.schema("iam").from("organization_member")
        .select("user_id").eq("organization_id", organizationId).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!membership) return NextResponse.json({ error: "Choose an organization you belong to." }, { status: 403 });
    }

    // REC-62: the subscription and its Stripe customer belong to the ORGANIZATION.
    let customerId: string;
    try {
      customerId = await ensureStripeCustomer({
        userId: user.id,
        organizationId,
        email: user.email ?? null,
        beneficiaryUserId: personal ? user.id : undefined,
      });
    } catch (err) {
      if (isBillingOrganizationRequiredError(err)) {
        return billingOrganizationRequiredResponse(supabase, err);
      }
      throw err;
    }
    const origin = request.nextUrl.origin;

    const stripe = getStripe();
    const actualPrice = await stripe.prices.retrieve(price.stripe_price_id);
    if (!actualPrice.active || actualPrice.livemode !== livemode || actualPrice.unit_amount !== price.unit_amount
      || actualPrice.currency !== price.currency || actualPrice.recurring?.interval !== price.interval
      || actualPrice.recurring.interval_count !== price.interval_count) throw new Error("Stripe price and catalog disagree");
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    if (subscriptions.data.some((s) => ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(s.status))) {
      const portal = await openSubscriptionPortal(customerId, personal, `${origin}/pricing`);
      return NextResponse.json({ url: portal.url });
    }
    const metadata = { acting_user_id: user.id, organization_id: organizationId!,
      ...(personal ? { beneficiary_user_id: user.id } : {}),
      ...(plan ? { plan_key: plan.plan_key, purpose: "platform_subscription", billing_cycle: cycle } : {}) };
    const open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
    const pending = open.data.find((s) => s.mode === "subscription" && s.metadata?.plan_key === plan?.plan_key && s.metadata?.billing_cycle === cycle);
    if (pending?.url) return NextResponse.json({ url: pending.url });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: price.stripe_price_id, quantity: plan?.per_seat ? Math.max(1, plan.min_seats ?? 1) : 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata, ...(price.trial_period_days ? { trial_period_days: price.trial_period_days } : {}) },
      success_url:
        body.successUrl ?? `${origin}/pricing?checkout=success`,
      cancel_url: body.cancelUrl ?? `${origin}/pricing?checkout=cancelled`,
      metadata,
    }, { idempotencyKey: `matrx-checkout-${customerId}-${price.stripe_price_id}-${Math.floor(Date.now() / 1800000)}` });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json(
      { error: "Failed to start checkout" },
      { status: 500 },
    );
  }
}
