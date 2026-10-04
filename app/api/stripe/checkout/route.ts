// app/api/stripe/checkout/route.ts
//
// POST /api/stripe/checkout — create a Stripe Checkout session for the authed
// user and a given price. Legitimate Next.js API-route surface (Stripe SDK).
//
// Local/preview use test prices; confirmed production uses live prices.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import {
  getStripe,
  isStripeConfigured,
  requiredStripeMode,
} from "@/lib/stripe/server";
import { ensureStripeCustomer } from "@/features/entitlements/stripe/sync";
import { syncPlanPrices } from "@/features/entitlements/stripe/planCatalog";
import { openSubscriptionPortal } from "@/features/entitlements/stripe/portal";
import {
  CheckoutBusyError,
  withCheckoutLease,
} from "@/features/entitlements/stripe/checkoutLease";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { readRequestOrganizationId } from "@/features/entitlements/stripe/billingOwner";
import { requestOrigin } from "@/utils/auth/request-origin";
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
    if (cycle !== "monthly" && cycle !== "annual")
      return NextResponse.json(
        { error: "Choose monthly or annual billing." },
        { status: 400 },
      );
    let planKey = body.planKey;
    if (!planKey && body.priceId) {
      const { data: legacyPrice, error } = await admin
        .schema("billing")
        .from("price")
        .select("metadata,interval")
        .eq("id", body.priceId)
        .eq("livemode", livemode)
        .eq("active", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      const hint = legacyPrice?.metadata;
      if (
        hint &&
        typeof hint === "object" &&
        !Array.isArray(hint) &&
        "plan_key" in hint &&
        typeof hint.plan_key === "string"
      )
        planKey = hint.plan_key;
      if (!planKey)
        return NextResponse.json(
          { error: "Choose a current plan on the pricing page." },
          { status: 400 },
        );
    }
    const { data: plan, error: planError } = await admin
      .schema("billing")
      .from("plan")
      .select(
        "plan_key,organization_id,audience,monthly_cents,annual_cents,per_seat,min_seats",
      )
      .eq("plan_key", planKey!)
      .eq("active", true)
      .is("deleted_at", null)
      .single();
    if (planError || !plan)
      return NextResponse.json(
        { error: "This plan is unavailable." },
        { status: 404 },
      );
    const amount =
      cycle === "monthly"
        ? plan.monthly_cents
        : plan.annual_cents == null
          ? null
          : plan.annual_cents * 12;
    if (
      !amount ||
      amount < 0 ||
      !["personal", "company"].includes(plan.audience)
    )
      return NextResponse.json(
        { error: "This plan does not require checkout." },
        { status: 400 },
      );
    const priceQuery = () =>
      admin
      .schema("billing")
      .from("price")
      .select(
        "stripe_price_id, active, trial_period_days, unit_amount, interval, currency, interval_count",
      )
      .eq("livemode", livemode)
      .eq("active", true)
      .is("deleted_at", null)
      .not("metadata->>plan_key", "is", null);
    const findPrice = () =>
      priceQuery()
        .contains("metadata", { plan_key: plan.plan_key })
        .eq("interval", cycle === "monthly" ? "month" : "year")
        .eq("unit_amount", amount)
        .maybeSingle();
    let { data: price, error: priceError } = await findPrice();
    if (priceError) throw priceError;
    if (!price) {
      // The plan's price is the truth (set in admin); Stripe follows it. A
      // price edited since the last sync gets its Stripe price here, once.
      await syncPlanPrices(getStripe(), admin, requiredStripeMode(), plan.plan_key);
      ({ data: price, error: priceError } = await findPrice());
      if (priceError) throw priceError;
    }
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
    const organizationId = personal
      ? plan.organization_id
      : readRequestOrganizationId(request);
    if (!personal && organizationId) {
      const { data: membership, error } = await supabase
        .schema("iam")
        .from("organization_member")
        .select("user_id,role")
        .eq("organization_id", organizationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!membership || !["owner", "admin"].includes(membership.role ?? ""))
        return NextResponse.json(
          {
            error:
              "An organization owner or admin must manage its subscription.",
          },
          { status: 403 },
        );
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
    const origin = requestOrigin(request.headers) ?? request.nextUrl.origin;

    const stripe = getStripe();
    const actualPrice = await stripe.prices.retrieve(price.stripe_price_id);
    if (
      !actualPrice.active ||
      actualPrice.livemode !== livemode ||
      actualPrice.unit_amount !== price.unit_amount ||
      actualPrice.currency !== price.currency ||
      actualPrice.recurring?.interval !== price.interval ||
      actualPrice.recurring.interval_count !== price.interval_count
    )
      throw new Error("Stripe price and catalog disagree");
    return await withCheckoutLease(customerId, livemode, async (assertHeld) => {
      // Each external operation is bounded well inside the renewed lease.
      const requestOptions = { timeout: 10_000, maxNetworkRetries: 0 };
      const subscriptions = await stripe.subscriptions.list(
        { customer: customerId, status: "all", limit: 100 },
        requestOptions,
      );
      if (
        subscriptions.data.some((s) =>
          [
            "active",
            "trialing",
            "past_due",
            "unpaid",
            "incomplete",
            "paused",
          ].includes(s.status),
        )
      ) {
        const portal = await openSubscriptionPortal(
          customerId,
          personal,
          `${origin}/pricing`,
        );
        return NextResponse.json({ url: portal.url });
      }
      const metadata = {
        acting_user_id: user.id,
        organization_id: organizationId!,
        ...(personal ? { beneficiary_user_id: user.id } : {}),
        plan_key: plan.plan_key,
        purpose: "platform_subscription",
        billing_cycle: cycle,
      };
      const open = await stripe.checkout.sessions.list(
        { customer: customerId, status: "open", limit: 100 },
        requestOptions,
      );
      const pending = open.data.find(
        (s) =>
          s.mode === "subscription" &&
          s.metadata?.plan_key === plan?.plan_key &&
          s.metadata?.billing_cycle === cycle,
      );
      if (
        pending?.url &&
        pending.success_url === `${origin}/pricing?checkout=success`
      )
        return NextResponse.json({ url: pending.url });
      // Retire abandoned alternatives before starting another checkout. These
      // are unpaid sessions, not subscriptions or charges.
      for (const previous of open.data.filter(
        (s) =>
          s.mode === "subscription" &&
          s.metadata?.purpose === "platform_subscription",
      )) {
        await assertHeld();
        await stripe.checkout.sessions.expire(previous.id, {}, requestOptions);
      }
      await assertHeld();
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: customerId,
          client_reference_id: user.id,
          line_items: [
            {
              price: actualPrice.id,
              quantity: plan?.per_seat ? Math.max(1, plan.min_seats ?? 1) : 1,
            },
          ],
          allow_promotion_codes: true,
          subscription_data: {
            metadata,
            ...(price.trial_period_days
              ? { trial_period_days: price.trial_period_days }
              : {}),
          },
          success_url: `${origin}/pricing?checkout=success`,
          cancel_url: `${origin}/pricing?checkout=cancelled`,
          metadata,
        },
        {
          ...requestOptions,
          idempotencyKey: `matrx-checkout-${customerId}-${price.stripe_price_id}-${open.data
            .map((s) => s.id)
            .sort()
            .join("-")}-${Math.floor(Date.now() / 1800000)}`,
        },
      );

      return NextResponse.json({ url: session.url });
    });
  } catch (err) {
    if (err instanceof CheckoutBusyError)
      return NextResponse.json({ error: err.message }, { status: 409 });
    console.error("[stripe/checkout]", err);
    return NextResponse.json(
      { error: "Failed to start checkout" },
      { status: 500 },
    );
  }
}
