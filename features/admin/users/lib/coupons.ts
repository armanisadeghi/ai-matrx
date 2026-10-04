// Free time & coupons — pure logic for the admin tab (/administration/users/coupons).
//
// The database owns every rule (billing.coupon_create / coupon_revoke / free_months_apply and
// the billing/free_period_max_months + billing/coupon_batch_max knobs; see
// common-docs/systems/platform/entitlements-knobs/FEATURE.md rule 18). This module only
// derives display state, parses pasted recipients, and drafts the send text.

export type CouponKind = "existing_account" | "new_account";
export type CouponStatus = "active" | "redeemed" | "revoked" | "expired";
export type SendChannel = "dm" | "email" | "sms";

export interface CouponRedemption {
  redeemer_user_id: string;
  redeemed_at: string;
  status: string;
}

export interface CouponSent {
  channel: SendChannel;
  address: string | null;
  sent_at: string;
  sent_by: string | null;
}

export interface CouponRow {
  id: string;
  code: string;
  kind: CouponKind;
  plan_key: string;
  months: number;
  max_redemptions: number;
  redeemed_count: number;
  expires_at: string | null;
  recipient_user_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  note: string | null;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
  sent: CouponSent[];
  redemptions: CouponRedemption[];
}

/** A coupon as coupon_create returns it — the only time a new-account link exists. */
export interface CreatedCoupon {
  id: string;
  code: string;
  kind: CouponKind;
  plan_key: string;
  months: number;
  expires_at: string | null;
  recipient_user_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  link_path: string | null;
}

export interface CouponRecipient {
  user_id?: string;
  email?: string;
  phone?: string;
}

export const KIND_LABEL: Record<CouponKind, string> = {
  existing_account: "Existing account",
  new_account: "New account",
};

export const STATUS_LABEL: Record<CouponStatus, string> = {
  active: "Active",
  redeemed: "Redeemed",
  revoked: "Revoked",
  expired: "Expired",
};

export function couponStatus(
  row: Pick<CouponRow, "revoked_at" | "redeemed_count" | "max_redemptions" | "expires_at">,
  now: Date = new Date(),
): CouponStatus {
  if (row.revoked_at) return "revoked";
  if (row.redeemed_count >= row.max_redemptions) return "redeemed";
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  return "active";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pasted recipients: one per line or comma/semicolon separated. An `@` makes it an email;
 * otherwise 10+ digits make it a phone (normalized to E.164, US default). Anything else is
 * returned in `invalid` so the dialog can name it instead of dropping it.
 */
export function parseRecipients(text: string): { recipients: CouponRecipient[]; invalid: string[] } {
  const recipients: CouponRecipient[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\n,;]+/)) {
    const token = raw.trim();
    if (!token) continue;
    if (token.includes("@")) {
      const email = token.toLowerCase();
      if (!EMAIL_RE.test(email)) {
        invalid.push(token);
        continue;
      }
      if (seen.has(email)) continue;
      seen.add(email);
      recipients.push({ email });
      continue;
    }
    const phone = normalizePhone(token);
    if (!phone) {
      invalid.push(token);
      continue;
    }
    if (seen.has(phone)) continue;
    seen.add(phone);
    recipients.push({ phone });
  }
  return { recipients, invalid };
}

export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** The thing a person types or opens: the code, or the full sign-up link for a new account. */
export function couponRedeemable(coupon: Pick<CreatedCoupon, "kind" | "code" | "link_path">, origin: string): string | null {
  if (coupon.kind === "new_account") return coupon.link_path ? `${origin}${coupon.link_path}` : null;
  return coupon.code;
}

export function monthsLabel(months: number): string {
  return `${months} month${months === 1 ? "" : "s"}`;
}

/** Short, editable send text. SMS-length on purpose. */
export function draftCouponMessage(input: {
  kind: CouponKind;
  redeemable: string;
  planName: string;
  months: number;
  origin: string;
}): string {
  const free = `${monthsLabel(input.months)} of AI Matrx ${input.planName}, free`;
  if (input.kind === "new_account") {
    return `You're invited: ${free}. Create your account with this one-time link: ${input.redeemable}`;
  }
  return `A gift for you: ${free}. Redeem code ${input.redeemable} at ${input.origin}/user-settings/plan`;
}

/** Months the dialog may offer — 1..cap, where cap is the live knob value. */
export function validateMonths(months: number, cap: number): string | null {
  if (!Number.isInteger(months) || months < 1) return "At least 1 month";
  if (months > cap) return `At most ${cap} months`;
  return null;
}

/** Read a knob value stored as a JSON number (or numeric string). */
export function knobNumber(value: unknown, fallback: number | null = null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

/** Replay-safe client_message_id for a coupon DM: same coupon + recipient + text = same key. */
export async function couponDmKey(couponId: string, conversationId: string, content: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([couponId, conversationId, content.trim()]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `coupon-send:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** free_months_apply result, one row per account. */
export interface FreeMonthsResult {
  user_id: string;
  ok: boolean;
  has_live_subscription: boolean;
  grant?: { plan_key: string; requested_plan_key: string; ends_at: string; capped: boolean };
  error?: string;
  detail?: string | null;
}

export function parseFreeMonthsApply(payload: unknown): { applied: number; failed: number; results: FreeMonthsResult[] } {
  const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const results = Array.isArray(obj.results) ? (obj.results as FreeMonthsResult[]) : [];
  return {
    applied: typeof obj.applied === "number" ? obj.applied : results.filter((r) => r.ok).length,
    failed: typeof obj.failed === "number" ? obj.failed : results.filter((r) => !r.ok).length,
    results,
  };
}

/** The DB's own words for a refusal: detail when it has one, else the message. */
export function refusalText(result: Pick<FreeMonthsResult, "error" | "detail">): string {
  return result.detail?.trim() || result.error?.trim() || "Refused";
}
