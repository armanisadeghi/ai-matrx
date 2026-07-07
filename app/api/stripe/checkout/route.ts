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
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { ensureStripeCustomer } from "@/features/entitlements/stripe/sync";

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

    const body = (await request.json().catch(() => ({}))) as {
      priceId?: string;
      successUrl?: string;
      cancelUrl?: string;
    };
    if (!body.priceId) {
      return NextResponse.json({ error: "priceId is required" }, { status: 400 });
    }

    // Resolve the Stripe price id from our mirror (never trust a client-sent
    // Stripe price id blindly — it must exist + be active in billing.price).
    const admin = createAdminClient();
    const { data: price } = await admin
      .schema("billing")
      .from("price")
      .select("stripe_price_id, active, trial_period_days")
      .eq("id", body.priceId)
      .maybeSingle();
    if (!price?.stripe_price_id || !price.active) {
      return NextResponse.json(
        { error: "Unknown or inactive price" },
        { status: 404 },
      );
    }

    const customerId = await ensureStripeCustomer(user.id, user.email ?? null);
    const origin = request.nextUrl.origin;

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: price.stripe_price_id, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: price.trial_period_days
        ? { trial_period_days: price.trial_period_days }
        : undefined,
      success_url:
        body.successUrl ?? `${origin}/pricing?checkout=success`,
      cancel_url: body.cancelUrl ?? `${origin}/pricing?checkout=cancelled`,
      metadata: { user_id: user.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json(
      { error: "Failed to start checkout" },
      { status: 500 },
    );
  }
}
