// app/api/stripe/portal/route.ts
//
// POST /api/stripe/portal — open the Stripe customer portal for the authed
// user. THIS is the one-click cancel path (TRUST mandate: no retention maze) —
// the portal is configured in the Stripe dashboard to allow immediate cancel.
//
// UNTESTED pending Stripe TEST keys.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";

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
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: customer } = await admin
      .schema("billing")
      .from("customer")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!customer?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No billing account for this user" },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${request.nextUrl.origin}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/portal]", err);
    return NextResponse.json(
      { error: "Failed to open billing portal" },
      { status: 500 },
    );
  }
}
