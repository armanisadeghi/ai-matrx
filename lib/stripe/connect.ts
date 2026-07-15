// lib/stripe/connect.ts
//
// The revenue-split model for creator payouts, in ONE place. A paid-class sale is
// a Stripe Connect DESTINATION CHARGE: the buyer is charged the full price on the
// platform account, the platform keeps `application_fee_amount`, and the remainder
// is transferred to the creator's connected (Express) account, from which Stripe
// runs the payout. Stripe hosts the payout/earnings UI — we link to the Express
// dashboard, we never rebuild it.
//
// SPLIT: platform 20% / creator 80%. Change PLATFORM_FEE_BPS to move the line;
// every surface (checkout, ledger, docs) reads it from here. Pure + importable —
// no I/O, no Stripe SDK — so it's usable from client display code AND the route.

/** Platform commission in basis points (1/100th of a percent). 2000 = 20%. */
export const PLATFORM_FEE_BPS = 2000;

/** Creator share in basis points — the complement of the platform fee. 8000 = 80%. */
export const CREATOR_SHARE_BPS = 10_000 - PLATFORM_FEE_BPS;

/** Human-readable split, e.g. for dashboards / docs. */
export const SPLIT_LABEL = `${PLATFORM_FEE_BPS / 100}% platform / ${CREATOR_SHARE_BPS / 100}% creator`;

/**
 * The platform's cut of a sale, in the smallest currency unit (cents), rounded to
 * the nearest whole unit. Passed to Stripe as `application_fee_amount`.
 */
export function platformFeeAmount(totalCents: number): number {
  return Math.round((totalCents * PLATFORM_FEE_BPS) / 10_000);
}

/** What the creator nets (transferred to their Connect account), in cents. */
export function creatorAmount(totalCents: number): number {
  return totalCents - platformFeeAmount(totalCents);
}

/**
 * The minimum a creator may charge for a paid class, in cents. Stripe's own floor
 * for a card charge is $0.50; below it the destination charge is rejected. We hold
 * a $1.00 floor so the 20% fee is always a whole, non-trivial cent amount.
 */
export const MIN_CLASS_PRICE_CENTS = 100;

/** Format cents as a USD price string for display, e.g. 2999 → "$29.99", 3000 → "$30". */
export function formatPriceCents(cents: number, currency = "usd"): string {
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}
