// features/entitlements/coupons/couponCopy.ts
//
// Pure: the client shapes of a coupon preview and a redeem result, and the
// one-line copy for every refusal code the database names (billing._coupon_take,
// billing._free_months_grant, POST /api/billing/coupons/redeem).

export interface CouponPreview {
  valid: boolean;
  reason: string | null;
  planKey: string | null;
  planName: string | null;
  months: number | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function parseCouponPreview(raw: unknown): CouponPreview | null {
  const v = rec(raw);
  if (!v || typeof v.valid !== "boolean") return null;
  return {
    valid: v.valid,
    reason: str(v.reason),
    planKey: str(v.plan_key),
    planName: str(v.plan_name),
    months: num(v.months),
    recipientEmail: str(v.recipient_email),
    recipientPhone: str(v.recipient_phone),
  };
}

/**
 * The plan's catalog name ("Pro"); without one, the plan key minus its
 * audience prefix, title-cased ("personal-pro" → "Pro").
 */
export function planLabel(planName: string | null, planKey: string | null): string {
  if (planName) return planName;
  if (!planKey) return "Paid plan";
  const bare = planKey.replace(/^(personal|company)-/, "").replace(/[_-]+/g, " ");
  return bare.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The grant's plan key in a redeem body, for a catalog name lookup. */
export function redeemPlanKey(body: unknown): string | null {
  return str(rec(rec(rec(body)?.result)?.grant)?.plan_key);
}

export function formatPlanDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** One line per refusal code. Unknown codes fall back to the server's message. */
const REFUSAL_COPY: Record<string, string> = {
  coupon_not_found: "That code doesn't exist.",
  coupon_already_redeemed: "You already redeemed this code.",
  coupon_used_up: "This code has already been used.",
  coupon_expired: "This code has expired.",
  coupon_revoked: "This code was withdrawn.",
  coupon_wrong_kind: "This code only works from its sign-up link.",
  coupon_not_new_account: "This link is for new accounts only.",
  coupon_not_recipient: "This code belongs to another account.",
  coupon_sign_in_first: "Sign in to redeem a code.",
  coupon_sign_up_first: "Create your account first, then redeem.",
  free_time_cap_reached: "You already hold the most free time allowed.",
  free_time_internal_grant: "Your staff plan doesn't take free time.",
  coupon_stripe_failed: "Your bill couldn't be updated. The code wasn't used.",
  billing_unavailable: "Billing isn't available right now.",
};

export function couponRefusalLine(code: string | null, message?: string | null): string {
  if (code && REFUSAL_COPY[code]) return REFUSAL_COPY[code];
  return message?.trim() || "This code couldn't be redeemed.";
}

/** The preview reason for an unusable link, as one line. */
export function invalidLinkLine(reason: string | null): string {
  return couponRefusalLine(reason ?? "coupon_not_found").replace(/code/g, "link");
}

export type RedeemOutcome =
  | { ok: true; line: string; planKey: string | null; body: unknown }
  | { ok: false; code: string | null; line: string };

/**
 * The success line from the route's body: a grant names its plan and end
 * ("Pro free until Mar 4, 2027"); the Stripe path names months off the bill.
 */
export function redeemSuccessLine(body: unknown, planName: string | null = null): string {
  const v = rec(body);
  if (v?.mode === "stripe") {
    const months = num(v.months);
    return months ? `${months} month${months === 1 ? "" : "s"} free on your bill` : "Free months added to your bill";
  }
  const grant = rec(rec(v?.result)?.grant);
  const plan = planLabel(planName, str(grant?.plan_key));
  const until = formatPlanDate(str(grant?.ends_at));
  return until ? `${plan} free until ${until}` : `${plan} free time added`;
}
