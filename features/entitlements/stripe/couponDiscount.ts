// features/entitlements/stripe/couponDiscount.ts
//
// "X months free" for a person who already PAYS (Arman 2026-10-04 free-time ruling): their months
// come off the Stripe bill instead of a database grant. One on-demand Stripe coupon per redemption
// (100% off, duration repeating, duration_in_months = X, max one use) is added to the
// subscription's discounts — every discount it already carries is kept. Both Stripe writes carry
// an idempotency key derived from the redemption id, so a retried request never creates a second
// coupon or applies one twice.

import type Stripe from "stripe";

export interface FreeMonthsDiscountInput {
  stripe: Stripe;
  subscriptionId: string;
  months: number;
  redemptionId: string;
  couponId: string;
  userId: string;
}

export interface FreeMonthsDiscountResult {
  stripeCouponId: string;
}

/** Creates the coupon, then applies it. If applying fails, the coupon is deleted
 * (best effort) and the error is thrown with the coupon id attached so the
 * caller can release the redemption and record what Stripe holds. */
export async function applyFreeMonthsToSubscription(
  input: FreeMonthsDiscountInput,
): Promise<FreeMonthsDiscountResult> {
  const { stripe, subscriptionId, months, redemptionId, couponId, userId } = input;
  const coupon = await stripe.coupons.create(
    {
      percent_off: 100,
      duration: "repeating",
      duration_in_months: months,
      max_redemptions: 1,
      name: `${months} ${months === 1 ? "month" : "months"} free`,
      metadata: {
        purpose: "free_time_coupon",
        matrx_coupon_id: couponId,
        matrx_redemption_id: redemptionId,
        user_id: userId,
      },
    },
    { idempotencyKey: `matrx-free-months-coupon-${redemptionId}` },
  );
  try {
    const current = await stripe.subscriptions.retrieve(subscriptionId);
    const kept = (current.discounts ?? []).map((d) => ({
      discount: typeof d === "string" ? d : d.id,
    }));
    await stripe.subscriptions.update(
      subscriptionId,
      { discounts: [...kept, { coupon: coupon.id }] },
      { idempotencyKey: `matrx-free-months-apply-${redemptionId}` },
    );
  } catch (err) {
    await stripe.coupons.del(coupon.id).catch((delErr: unknown) => {
      console.error("[billing/coupons] orphan Stripe coupon left behind", coupon.id, delErr);
    });
    throw new FreeMonthsDiscountError(err, coupon.id);
  }
  return { stripeCouponId: coupon.id };
}

export class FreeMonthsDiscountError extends Error {
  constructor(
    readonly causeError: unknown,
    readonly stripeCouponId: string | null,
  ) {
    super(causeError instanceof Error ? causeError.message : String(causeError));
    this.name = "FreeMonthsDiscountError";
  }
}
