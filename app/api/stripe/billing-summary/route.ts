import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { getStripe, isStripeConfigured, requiredStripeMode } from "@/lib/stripe/server";
import { ownerEq, billingOwnerRef, readRequestOrganizationState } from "@/features/entitlements/stripe/billingOwner";
import { billingOrganizationRequiredResponse, isBillingOrganizationRequiredError } from "@/features/entitlements/stripe/billingOwnerRoute";

export async function GET() {
  return NextResponse.json({ livemode: requiredStripeMode() === "live" });
}

function invoiceRecovery(invoice: Stripe.Invoice | null): { url: string | null; status: string | null; requiresAction: boolean } {
  const paymentIntent = invoice?.payment_intent;
  const paymentStatus = typeof paymentIntent === "string" ? null : paymentIntent?.status ?? null;
  return {
    url: invoice?.hosted_invoice_url ?? null,
    status: invoice?.status ?? null,
    requiresAction: paymentStatus === "requires_action",
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) return NextResponse.json({ error: "Billing is unavailable." }, { status: 503 });
    const body: unknown = await request.json().catch(() => null);
    const scope = body && typeof body === "object" && "scope" in body ? body.scope : null;
    if (scope !== "personal" && scope !== "organization") return NextResponse.json({ error: "Choose a billing account." }, { status: 400 });
    const client = await createClient();
    const { data: { user } } = await getClaimsUser(client);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const admin = createAdminClient();
    const livemode = requiredStripeMode() === "live";
    let subscriptionQuery = admin.schema("billing").from("subscription").select("stripe_subscription_id").eq("livemode", livemode);

    if (scope === "personal") {
      subscriptionQuery = subscriptionQuery.eq("beneficiary_user_id", user.id);
    } else {
      let owner;
      try {
        owner = await billingOwnerRef({ userId: user.id, organization: readRequestOrganizationState(request) });
      } catch (error) {
        if (isBillingOrganizationRequiredError(error)) return billingOrganizationRequiredResponse(client, error);
        throw error;
      }
      const { data: membership, error: membershipError } = await client.schema("iam").from("organization_member").select("role").eq("organization_id", owner.value).eq("user_id", user.id).maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership || !["owner", "admin"].includes(membership.role ?? "")) return NextResponse.json({ error: "An organization owner or admin must manage its subscription." }, { status: 403 });
      subscriptionQuery = ownerEq(subscriptionQuery, owner).is("beneficiary_user_id", null);
    }
    const { data: subscription, error } = await subscriptionQuery
      .order("current_period_end", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!subscription?.stripe_subscription_id) return NextResponse.json({ invoice: null });
    const stripeSubscription = await getStripe().subscriptions.retrieve(subscription.stripe_subscription_id, { expand: ["latest_invoice.payment_intent"] });
    const latestInvoice = typeof stripeSubscription.latest_invoice === "string" ? null : stripeSubscription.latest_invoice;
    return NextResponse.json({ invoice: invoiceRecovery(latestInvoice) });
  } catch (error) {
    console.error("[stripe/billing-summary]", error);
    return NextResponse.json({ error: "Billing recovery could not be loaded." }, { status: 500 });
  }
}
