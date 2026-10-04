// app/api/billing/coupons/redeem/route.ts
//
// POST /api/billing/coupons/redeem  { code }  — the ONE door a client uses to redeem a free-time
// coupon (a code, or a new-account link token). Lives in Next only because the paying-subscriber
// case needs the Stripe secret (Arman 2026-10-04: free time is never endless; a payer's months come
// off their bill):
//   * no live subscription in this deployment's Stripe ledger -> billing.coupon_redeem as the
//     signed-in person (dated free time through billing._free_months_grant);
//   * a live subscription -> billing.coupon_claim_for_subscription (locks + counts the coupon), a
//     100%-off repeating Stripe coupon for X months on their subscription, then
//     billing.coupon_claim_settle (applied, or released so the coupon can be used again).
// Every refusal answers { error: <code>, message } with the code the database named.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { getStripe, isStripeConfigured, requiredStripeMode } from "@/lib/stripe/server";
import {
  applyFreeMonthsToSubscription,
  FreeMonthsDiscountError,
} from "@/features/entitlements/stripe/couponDiscount";

const STATUS_BY_CODE: Record<string, number> = {
  coupon_sign_in_first: 401,
  coupon_not_recipient: 403,
  coupon_not_found: 404,
  coupon_used_up: 409,
  coupon_already_redeemed: 409,
  coupon_expired: 410,
  coupon_revoked: 410,
  coupon_paying_subscriber: 409,
  free_time_cap_reached: 409,
};

interface DbError {
  message: string;
  details?: string | null;
}

function refusal(error: DbError) {
  const code = /^[a-z_]+$/.test(error.message) ? error.message : "coupon_refused";
  return NextResponse.json(
    { error: code, message: error.details || error.message },
    { status: STATUS_BY_CODE[code] ?? 400 },
  );
}

interface Claim {
  redemption_id: string;
  coupon_id: string;
  months: number;
}

function readClaim(value: unknown): Claim | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return typeof v.redemption_id === "string" &&
    typeof v.coupon_id === "string" &&
    typeof v.months === "number"
    ? { redemption_id: v.redemption_id, coupon_id: v.coupon_id, months: v.months }
    : null;
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const code =
    body && typeof body === "object" && "code" in body && typeof body.code === "string"
      ? body.code.trim()
      : "";
  if (!code) {
    return NextResponse.json(
      { error: "coupon_not_found", message: "Enter a coupon code." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await getClaimsUser(supabase);
  if (!user) {
    return NextResponse.json(
      { error: "coupon_sign_in_first", message: "Sign in to redeem a coupon." },
      { status: 401 },
    );
  }

  try {
    const mode = requiredStripeMode();
    const admin = createAdminClient();
    const { data: subscription, error: subError } = await admin
      .schema("billing")
      .from("subscription")
      .select("stripe_subscription_id, cancel_at_period_end")
      .eq("beneficiary_user_id", user.id)
      .eq("livemode", mode === "live")
      .in("status", ["active", "trialing", "past_due"])
      .gt("current_period_end", new Date().toISOString())
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw subError;

    if (!subscription?.stripe_subscription_id) {
      const { data, error } = await supabase
        .schema("billing")
        .rpc("coupon_redeem", { p_code: code });
      if (error) return refusal(error);
      return NextResponse.json({ mode: "grant", result: data });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "billing_unavailable", message: "Billing is not configured yet." },
        { status: 503 },
      );
    }
    const subscriptionId = subscription.stripe_subscription_id;
    const { data: claimData, error: claimError } = await admin
      .schema("billing")
      .rpc("coupon_claim_for_subscription", {
        p_code: code,
        p_user: user.id,
        p_stripe_subscription_id: subscriptionId,
      });
    if (claimError) return refusal(claimError);
    const claim = readClaim(claimData);
    if (!claim) throw new Error("coupon_claim_for_subscription returned no claim");

    let stripeCouponId: string;
    try {
      ({ stripeCouponId } = await applyFreeMonthsToSubscription({
        stripe: getStripe(mode),
        subscriptionId,
        months: claim.months,
        redemptionId: claim.redemption_id,
        couponId: claim.coupon_id,
        userId: user.id,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[billing/coupons] Stripe discount failed; releasing the coupon", err);
      const { error: releaseError } = await admin.schema("billing").rpc("coupon_claim_settle", {
        p_redemption_id: claim.redemption_id,
        p_stripe_coupon_id: err instanceof FreeMonthsDiscountError ? (err.stripeCouponId ?? "") : "",
        p_error: message,
      });
      if (releaseError) {
        console.error("[billing/coupons] could not release the claim — coupon stays spoken for", claim.redemption_id, releaseError);
      }
      return NextResponse.json(
        { error: "coupon_stripe_failed", message: "Your bill could not be updated. The coupon was not used." },
        { status: 502 },
      );
    }

    const { error: settleError } = await admin.schema("billing").rpc("coupon_claim_settle", {
      p_redemption_id: claim.redemption_id,
      p_stripe_coupon_id: stripeCouponId,
    });
    if (settleError) {
      // Stripe holds the discount; the redemption stays stripe_pending (still counted, so the
      // coupon cannot be used twice). Loud, not fatal to the person.
      console.error("[billing/coupons] Stripe discount applied but the redemption was not settled", claim.redemption_id, stripeCouponId, settleError);
    }
    return NextResponse.json({
      mode: "stripe",
      months: claim.months,
      stripe_coupon_id: stripeCouponId,
      subscription_id: subscriptionId,
      cancel_at_period_end: subscription.cancel_at_period_end,
    });
  } catch (err) {
    console.error("[billing/coupons/redeem]", err);
    return NextResponse.json(
      { error: "coupon_redeem_failed", message: "The coupon could not be redeemed." },
      { status: 500 },
    );
  }
}
