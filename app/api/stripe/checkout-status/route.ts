// POST /api/stripe/checkout-status
//
// A Checkout return URL proves only that a browser navigated here. This route
// verifies the authenticated billing customer, a completed matching Checkout
// session, its payment state, and the resulting Stripe subscription before it
// says access is active. It also uses the canonical Stripe-to-mirror writer so
// a slow webhook cannot leave the UI waiting on an otherwise confirmed charge.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import {
  getStripe,
  isStripeConfigured,
  requiredStripeMode,
} from "@/lib/stripe/server";
import { syncSubscription } from "@/features/entitlements/stripe/sync";
import {
  billingOwnerRef,
  ownerEq,
} from "@/features/entitlements/stripe/billingOwner";
import {
  billingOrganizationRequiredResponse,
  isBillingOrganizationRequiredError,
} from "@/features/entitlements/stripe/billingOwnerRoute";
import { isVerifiedCheckoutSession } from "@/features/pricing/components/checkoutReturn";

type CheckoutStatus = "active" | "pending" | "unavailable";

function response(status: CheckoutStatus, httpStatus = 200) {
  return NextResponse.json({ status }, { status: httpStatus });
}

export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) return response("unavailable", 503);
    const supabase = await createClient();
    const {
      data: { user },
    } = await getClaimsUser(supabase);
    if (!user)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
    };
    if (!body.sessionId?.startsWith("cs_")) {
      return NextResponse.json(
        { error: "A Checkout session is required." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const livemode = requiredStripeMode() === "live";
    const stripe = getStripe();
    // Do not search history: a return must prove this precise Stripe session.
    const session = await stripe.checkout.sessions.retrieve(
      body.sessionId,
      { expand: ["subscription"] },
      { timeout: 10_000, maxNetworkRetries: 0 },
    );
    const planKey = session.metadata?.plan_key;
    const cycle = session.metadata?.billing_cycle;
    if (
      !isVerifiedCheckoutSession(body.sessionId, user.id, {
        id: session.id,
        mode: session.mode,
        status: session.status,
        clientReferenceId: session.client_reference_id,
        purpose: session.metadata?.purpose,
        planKey,
        cycle,
        paymentStatus: session.payment_status,
        hasSubscription: Boolean(session.subscription),
      })
    )
      return response("pending");

    const { data: plan, error: planError } = await admin
      .schema("billing")
      .from("plan")
      .select("plan_key,audience,organization_id")
      .eq("plan_key", planKey)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan || !["personal", "company"].includes(plan.audience)) {
      return NextResponse.json(
        { error: "This plan is unavailable." },
        { status: 404 },
      );
    }

    const personal = plan.audience === "personal";
    const organizationId = personal
      ? plan.organization_id
      : session.metadata?.organization_id;
    if (!organizationId || session.metadata?.organization_id !== organizationId)
      return response("pending");
    if (!personal && organizationId) {
      const { data: membership, error } = await supabase
        .schema("iam")
        .from("organization_member")
        .select("user_id,role")
        .eq("organization_id", organizationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!membership || !["owner", "admin"].includes(membership.role ?? "")) {
        return NextResponse.json(
          {
            error:
              "An organization owner or admin must manage its subscription.",
          },
          { status: 403 },
        );
      }
    }

    const owner = await billingOwnerRef({ userId: user.id, organizationId });
    let customerQuery = ownerEq(
      admin.schema("billing").from("customer").select("stripe_customer_id"),
      owner,
    ).eq("livemode", livemode);
    customerQuery = personal
      ? customerQuery.eq("beneficiary_user_id", user.id)
      : customerQuery.is("beneficiary_user_id", null);
    const { data: customer, error: customerError } =
      await customerQuery.maybeSingle();
    if (customerError) throw customerError;
    if (!customer?.stripe_customer_id) return response("pending");

    const sessionCustomer =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;
    if (sessionCustomer !== customer.stripe_customer_id)
      return response("pending");

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
    const subscription = await stripe.subscriptions.retrieve(
      subscriptionId,
      {
        expand: ["items.data.price"],
      },
      { timeout: 10_000, maxNetworkRetries: 0 },
    );
    const subscriptionCustomer =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    if (
      subscriptionCustomer !== customer.stripe_customer_id ||
      !["active", "trialing"].includes(subscription.status) ||
      subscription.metadata.plan_key !== plan.plan_key ||
      subscription.metadata.billing_cycle !== cycle
    )
      return response("pending");

    await syncSubscription(subscription);
    let mirrorQuery = ownerEq(
      admin
        .schema("billing")
        .from("subscription")
        .select("stripe_subscription_id"),
      owner,
    )
      .eq("stripe_subscription_id", subscription.id)
      .eq("livemode", livemode)
      .eq("plan_key", plan.plan_key)
      .in("status", ["active", "trialing"]);
    mirrorQuery = personal
      ? mirrorQuery.eq("beneficiary_user_id", user.id)
      : mirrorQuery.is("beneficiary_user_id", null);
    const { data: mirrored, error: mirrorError } =
      await mirrorQuery.maybeSingle();
    if (mirrorError) throw mirrorError;
    return response(mirrored ? "active" : "pending");
  } catch (error) {
    if (isBillingOrganizationRequiredError(error)) {
      const supabase = await createClient();
      return billingOrganizationRequiredResponse(supabase, error);
    }
    console.error("[stripe/checkout-status]", error);
    return response("unavailable", 503);
  }
}
