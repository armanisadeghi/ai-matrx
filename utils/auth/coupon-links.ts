/**
 * utils/auth/coupon-links.ts
 *
 * THE free-time coupon link shape (rule 18, entitlements-knobs/FEATURE.md).
 *
 * A new-account coupon arrives as `/sign-up?coupon=<link token>`. The token
 * rides the canonical destination primitive (auth-destination.ts) and nothing
 * else: the sign-up page turns it into the destination `/redeem?code=<token>`,
 * so every hop that already keeps `redirectTo` — a wrong password, the email
 * confirmation link, an OAuth round trip, an authed visitor bounced off
 * `/sign-up` — keeps the coupon too, and `/redeem` redeems it exactly once
 * when the account exists. Existing accounts use the same `/redeem?code=`.
 *
 * Pure functions only — imported by the proxy, the sign-up page and /redeem.
 */

import { readAuthDestination } from "@/utils/auth/auth-destination";

/** The sign-up query parameter carrying a new-account coupon token. */
export const COUPON_PARAM = "coupon";
/** The redeem page and its code parameter. */
export const REDEEM_PATH = "/redeem";
export const REDEEM_CODE_PARAM = "code";

/** Link tokens are URL-safe base64/hex; codes are MX-XXXX-XXXX. */
const TOKEN_SHAPE = /^[A-Za-z0-9._~-]{6,200}$/;

type Source =
  | URLSearchParams
  | FormData
  | Record<string, string | string[] | undefined | null>
  | null
  | undefined;

function readParam(source: Source, name: string): string | null {
  if (!source) return null;
  let raw: unknown;
  const getter = (source as { get?: unknown }).get;
  if (typeof getter === "function") {
    raw = (getter as (k: string) => unknown).call(source, name);
  } else {
    raw = (source as Record<string, unknown>)[name];
    if (Array.isArray(raw)) raw = raw[0];
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return TOKEN_SHAPE.test(trimmed) ? trimmed : null;
}

/** `/redeem?code=<code>` — the one place a coupon is redeemed. */
export function couponRedeemPath(code: string): string {
  return `${REDEEM_PATH}?${REDEEM_CODE_PARAM}=${encodeURIComponent(code)}`;
}

/** The code inside a `/redeem?code=` destination, or null. */
export function couponFromRedeemPath(path: string | null): string | null {
  if (!path) return null;
  try {
    const url = new URL(path, "http://x");
    if (url.pathname !== REDEEM_PATH) return null;
    return readParam(url.searchParams, REDEEM_CODE_PARAM);
  } catch {
    return null;
  }
}

/**
 * The coupon token an auth page is carrying: `?coupon=` on the first visit,
 * or the destination `/redeem?code=` on every later hop (an error re-render
 * keeps only `redirectTo`).
 */
export function readCouponToken(source: Source): string | null {
  return (
    readParam(source, COUPON_PARAM) ??
    couponFromRedeemPath(readAuthDestination(source))
  );
}

/**
 * The destination an auth page should carry: an explicit one wins; otherwise
 * a coupon link becomes `/redeem?code=<token>`.
 */
export function couponAwareDestination(source: Source): string | null {
  const explicit = readAuthDestination(source);
  if (explicit) return explicit;
  const token = readParam(source, COUPON_PARAM);
  return token ? couponRedeemPath(token) : null;
}
