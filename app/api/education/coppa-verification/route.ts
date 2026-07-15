// app/api/education/coppa-verification/route.ts
//
// POST /api/education/coppa-verification — start the COPPA card-verification for a
// linked child. The GUARDIAN (an adult) initiates; we create a $0.50 Stripe
// Checkout session in MANUAL-CAPTURE mode (an authorization, not a charge). When
// they complete it, the Stripe webhook voids the auth and marks the guardian_link
// verified (see features/education/compliance/consent/verificationSync.ts). The
// child is NEVER in this flow and can never self-verify.
//
// Distinct from the subscription checkout (app/api/stripe/checkout) and creator
// payouts — this is the verifiable-consent flow. It only reuses the Stripe client
// + the billing.customer mapping.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { ensureStripeCustomer } from "@/features/entitlements/stripe/sync";
import { COPPA_VERIFICATION_PURPOSE } from "@/features/education/compliance/consent/verificationSync";

export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Card verification is not configured yet." },
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
      studentUserId?: string;
    };
    if (!body.studentUserId) {
      return NextResponse.json(
        { error: "studentUserId is required" },
        { status: 400 },
      );
    }

    // The caller must be the GUARDIAN on an ACTIVE link to this student. RLS lets
    // a guardian read their own links; this both authorizes and fetches link_id.
    const { data: link } = await supabase
      .schema("education")
      .from("guardian_link")
      .select("id, verified_at")
      .eq("guardian_user_id", user.id)
      .eq("student_user_id", body.studentUserId)
      .eq("status", "active")
      .maybeSingle();
    if (!link) {
      return NextResponse.json(
        { error: "No active guardian link to this student" },
        { status: 403 },
      );
    }
    if (link.verified_at) {
      return NextResponse.json({ error: "Already verified" }, { status: 409 });
    }

    const customerId = await ensureStripeCustomer(user.id, user.email ?? null);
    const origin = request.nextUrl.origin;

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      // Manual capture => an authorization we void, so $0 ever settles. A
      // successful auth still proves the adult cardholder (COPPA §312.5).
      payment_intent_data: { capture_method: "manual" },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 50,
            product_data: {
              name: "Parental consent verification",
              description:
                "A $0.50 card authorization to verify you are the parent/guardian. It is voided immediately — you are not charged.",
            },
          },
        },
      ],
      metadata: {
        purpose: COPPA_VERIFICATION_PURPOSE,
        link_id: link.id,
        guardian_user_id: user.id,
        student_user_id: body.studentUserId,
      },
      success_url: `${origin}/education/family?consent=verifying`,
      cancel_url: `${origin}/education/family?consent=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[education/coppa-verification]", err);
    return NextResponse.json(
      { error: "Failed to start verification" },
      { status: 500 },
    );
  }
}
