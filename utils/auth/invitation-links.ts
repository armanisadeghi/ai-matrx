/**
 * utils/auth/invitation-links.ts
 *
 * THE invitation accept-link shape, and the one rule that lets a brand-new
 * colleague finish an invitation.
 *
 * ## The flaw this exists to close (DD-091, 2026-09-10)
 *
 * `inv_get_by_token` is `authenticated`-only and gated to the invited party:
 * an anonymous visitor holding an invite link cannot read WHO the invite is
 * for. Every accept page therefore used to bounce an anonymous visitor to
 * `/login` — a dead end for the exact person an invitation exists to reach,
 * who has no account yet. They had to notice the sign-up link themselves, and
 * then guess that they must sign up with the *precise* address the invite was
 * sent to (any other address hits "This invitation is for X.").
 *
 * The fix has two halves and neither one weakens a grant:
 *
 * 1. **The link carries the address it was sent to** (`?email=`). The link is
 *    already the bearer secret and it is only ever delivered to that mailbox,
 *    so it tells the recipient nothing they do not already know. It is DISPLAY
 *    data only — every authorization decision still comes from
 *    `inv_get_by_token` matching the signed-in `auth.email()`. Never trust
 *    this value for anything but prefilling a field and writing a sentence.
 * 2. **An anonymous visitor goes to sign-up, not login**, carrying that
 *    address and a `redirectTo` back to the accept page. Sign-up already
 *    offers "Already have an account? Sign in" preserving the destination, so
 *    the returning user is one click away.
 *
 * Pure functions only — imported by server routes, client link builders, the
 * accept pages, and the sign-up page alike.
 */

import { signUpHref } from "@/utils/auth/auth-destination";

/** The query parameter carrying the invited address. */
export const INVITED_EMAIL_PARAM = "email";

/** The loosest shape we will echo back into a field or a sentence. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Read an invited address out of a query string, a `URLSearchParams`, a Next
 * `searchParams` object, or a `FormData`. Returns `null` unless the value is
 * present and email-shaped — a junk or crafted param must never reach a
 * rendered sentence.
 */
export function readInvitedEmail(
  source:
    | URLSearchParams
    | FormData
    | Record<string, string | string[] | undefined | null>
    | string
    | null
    | undefined,
): string | null {
  if (!source) return null;
  let raw: unknown = null;
  if (typeof source === "string") {
    const query = source.includes("?")
      ? source.slice(source.indexOf("?"))
      : source;
    try {
      raw = new URLSearchParams(query).get(INVITED_EMAIL_PARAM);
    } catch {
      return null;
    }
  } else {
    // Duck-typed for the same cross-realm reason as `auth-destination.ts`.
    const getter = (source as { get?: unknown }).get;
    if (typeof getter === "function") {
      raw = (source as { get(k: string): unknown }).get(INVITED_EMAIL_PARAM);
    } else {
      const value = (
        source as Record<string, string | string[] | undefined | null>
      )[INVITED_EMAIL_PARAM];
      raw = Array.isArray(value) ? (value[0] ?? null) : value;
    }
  }
  if (typeof raw !== "string") return null;
  const candidate = raw.trim().toLowerCase();
  if (!candidate || !looksLikeEmail(candidate)) return null;
  return candidate;
}

/**
 * Stamp the invited address onto an accept URL (absolute or relative). A
 * missing or non-email value leaves the URL exactly as it was — the flow still
 * works, it just cannot prefill.
 */
export function withInvitedEmail(
  acceptUrl: string,
  email: string | null | undefined,
): string {
  if (typeof email !== "string") return acceptUrl;
  const candidate = email.trim().toLowerCase();
  if (!candidate || !looksLikeEmail(candidate)) return acceptUrl;
  const [base, hash] = acceptUrl.split("#");
  const separator = base.includes("?") ? "&" : "?";
  const rebuilt = `${base}${separator}${INVITED_EMAIL_PARAM}=${encodeURIComponent(candidate)}`;
  return hash ? `${rebuilt}#${hash}` : rebuilt;
}

/**
 * Where an ANONYMOUS visitor holding an invitation link must go: sign-up,
 * carrying the invited address (when the link told us one) and a destination
 * back to the accept page. This is the single call every accept page makes —
 * do not hand-build a `/login?redirectTo=…` for an invitee again.
 *
 * `acceptPath` is the accept route's own path; any `?email=` already on it is
 * dropped so the destination stays canonical and the address is stamped once.
 */
export function invitationSignUpHref(
  acceptPath: string,
  email?: string | null,
): string {
  const destination = acceptPath.split("?")[0].split("#")[0];
  return withInvitedEmail(signUpHref(destination), email);
}
