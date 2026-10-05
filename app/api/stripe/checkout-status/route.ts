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
  readRequestOrganizationId,
} from "@/features/entitlements/stripe/billingOwner";
import {
  billingOrganizationRequiredResponse,
  isBillingOrganizationRequiredError,
} from "@/features/entitlements/stripe/billingOwnerRoute";

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
      planKey?: string;
      cycle?: "monthly" | "annual";
    };
    if (
      !body.planKey ||
      (body.cycle && body.cycle !== "monthly" && body.cycle !== "annual")
    ) {
      return NextResponse.json(
        { error: "Choose a current plan." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const livemode = requiredStripeMode() === "live";
    const { data: plan, error: planError } = await admin
      .schema("billing")
      .from("plan")
      .select("plan_key,audience,organization_id")
      .eq("plan_key", body.planKey)
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

    const stripe = getStripe();
    const sessions = await stripe.checkout.sessions.list(
      {
        customer: customer.stripe_customer_id,
        status: "complete",
        limit: 20,
      },
      { timeout: 10_000, maxNetworkRetries: 0 },
    );
    const session = sessions.data.find(
      (candidate) =>
        candidate.mode === "subscription" &&
        candidate.client_reference_id === user.id &&
        candidate.metadata?.purpose === "platform_subscription" &&
        candidate.metadata.plan_key === plan.plan_key &&
        candidate.metadata.billing_cycle === (body.cycle ?? "monthly") &&
        (candidate.payment_status === "paid" ||
          candidate.payment_status === "no_payment_required") &&
        candidate.subscription,
    );
    if (!session || !session.subscription) return response("pending");

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
      !["active", "trialing"].includes(subscription.status)
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
