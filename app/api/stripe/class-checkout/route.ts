// app/api/stripe/class-checkout/route.ts
//
// POST /api/stripe/class-checkout — buy access to a PAID class. Creates a Stripe
// Checkout session as a Connect DESTINATION CHARGE: the buyer pays the full price
// on the platform account, the platform keeps application_fee_amount (the 20% cut,
// from lib/stripe/connect.ts), and the remainder transfers to the creator's Express
// account. The class price is read AUTHORITATIVELY from the class scope settings
// server-side (never trusted from the client). On checkout.session.completed the
// webhook confers the enrolment — this route NEVER grants access (webhook-only gate).
//
// Guardrails: paid mode required, price ≥ floor, creator must be onboarded with
// charges enabled, buyer can't buy their own class, already-enrolled short-circuits.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { ensureStripeCustomer } from "@/features/entitlements/stripe/sync";
import {
  getConnectAccountByUser,
  recordPendingPurchase,
} from "@/features/entitlements/stripe/connect";
import {
  platformFeeAmount,
  creatorAmount,
  MIN_CLASS_PRICE_CENTS,
} from "@/lib/stripe/connect";

/** Only accept an in-app relative return path (no open redirect). */
function safePath(p: unknown, fallback: string): string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//")
    ? p
    : fallback;
}

export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Payments are not configured yet." },
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
      classId?: string;
      returnTo?: string;
    };
    if (!body.classId) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    // Resolve the class scope authoritatively (admin bypasses RLS). Confirm it is
    // a Class scope, read its owner + access mode + price from settings.
    const admin = createAdminClient();
    const { data: scope } = await admin
      .schema("context")
      .from("scopes")
      .select("id, name, settings, created_by, organization_id, scope_type_id, deleted_at")
      .eq("id", body.classId)
      .maybeSingle();
    if (!scope || scope.deleted_at) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }
    const settings = (scope.settings ?? {}) as Record<string, unknown>;
    const accessMode = String(settings.access_mode ?? "");
    const priceCents = Number(settings.price_cents ?? 0);

    if (accessMode !== "paid") {
      return NextResponse.json(
        { error: "This class is not a paid class." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(priceCents) || priceCents < MIN_CLASS_PRICE_CENTS) {
      return NextResponse.json(
        { error: "This class does not have a valid price set." },
        { status: 400 },
      );
    }

    const ownerId = scope.created_by;
    if (!ownerId) {
      return NextResponse.json(
        { error: "This class has no owner to pay." },
        { status: 400 },
      );
    }
    if (ownerId === user.id) {
      return NextResponse.json(
        { error: "You own this class — you can't enrol in it." },
        { status: 400 },
      );
    }

    // Already an active member? Short-circuit (no double charge).
    const { data: membership } = await admin
      .schema("iam")
      .from("memberships")
      .select("status")
      .eq("container_type", "scope")
      .eq("container_id", scope.id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (membership?.status === "active") {
      return NextResponse.json({ alreadyEnrolled: true });
    }

    // The creator must be onboarded with charges enabled to receive the transfer.
    const connect = await getConnectAccountByUser(ownerId);
    if (!connect || !connect.chargesEnabled) {
      return NextResponse.json(
        {
          error:
            "This creator hasn't finished setting up payouts yet, so enrolment isn't open. Please check back soon.",
          creatorNotReady: true,
        },
        { status: 409 },
      );
    }

    const currency = (connect.defaultCurrency ?? "usd").toLowerCase();
    const feeAmount = platformFeeAmount(priceCents);
    const creatorNet = creatorAmount(priceCents);

    const customerId = await ensureStripeCustomer(user.id, user.email ?? null);
    const origin = request.nextUrl.origin;
    const returnTo = safePath(body.returnTo, `/education/classes/${scope.id}`);
    const sep = returnTo.includes("?") ? "&" : "?";

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: priceCents,
            product_data: {
              name: scope.name || "Class enrolment",
              description: "Full access to this class on AI Matrx",
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeAmount,
        transfer_data: { destination: connect.stripeAccountId },
        metadata: {
          kind: "class_purchase",
          class_id: scope.id,
          buyer_user_id: user.id,
          creator_user_id: ownerId,
        },
      },
      success_url: `${origin}${returnTo}${sep}enrolled=1`,
      cancel_url: `${origin}${returnTo}${sep}enrolled=cancelled`,
      metadata: {
        kind: "class_purchase",
        class_id: scope.id,
        buyer_user_id: user.id,
        creator_user_id: ownerId,
      },
    });

    // Record the pending sale (the webhook flips it to paid + confers enrolment).
    await recordPendingPurchase({
      buyerUserId: user.id,
      classId: scope.id,
      creatorUserId: ownerId,
      organizationId: scope.organization_id ?? null,
      stripeCheckoutSessionId: session.id,
      stripeAccountId: connect.stripeAccountId,
      amountTotal: priceCents,
      applicationFeeAmount: feeAmount,
      creatorAmount: creatorNet,
      currency,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/class-checkout]", err);
    return NextResponse.json(
      { error: "Failed to start checkout" },
      { status: 500 },
    );
  }
}
