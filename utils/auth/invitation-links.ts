/**
 * utils/auth/invitation-links.ts
 *
 * THE invitation link shape, and the one rule that lets a brand-new colleague
 * finish an invitation.
 *
 * ## The flaw this exists to close (DD-091, 2026-09-10)
 *
 * `inv_get_by_token` is `authenticated`-only and gated to the invited party, so
 * every accept page used to bounce an anonymous visitor to `/login` — a dead
 * end for the exact person an invitation exists to reach, who has no account
 * yet. They had to notice the sign-up link themselves and then guess that they
 * must sign up with the *precise* address the invite was sent to.
 *
 * An anonymous invitee now goes to SIGN-UP, carrying two things and only two:
 * a `redirectTo` back to the accept page, and the invitation **token**.
 *
 * ## THE TOKEN TRAVELS, THE ADDRESS NEVER DOES (chair ruling, 2026-09-11)
 *
 * The first cut put the invited address in the URL (`?email=`). That is below
 * the bar every champion sets — GitHub, Slack, Notion, Google Workspace and
 * Supabase's own invite all carry a token and resolve the address server-side.
 * The exposed party is not the recipient (who knows their own address) but the
 * **intermediaries**: a query string lands in browser history, synced history,
 * and every edge/CDN access log the request passes through, where the address
 * is stable PII that outlives by years the token sitting beside it. It also
 * breaks the standing rule that personal data never goes in a query string.
 *
 * So the link carries `?invite=<token>` and the sign-up page resolves the
 * address through the one narrow door `public.inv_peek_invited_email(p_token)`
 * (`migrations/inv_peek_invited_email.sql`): anonymous-callable, returns ONLY
 * the email, and only for a pending, unaccepted, unexpired invitation. The
 * token is the secret and was mailed to that address; the door grants nothing.
 *
 * Pure functions only — imported by server routes, client link builders, the
 * accept pages, and the auth pages alike. The lookup itself lives in
 * `utils/auth/invited-email-lookup.ts` (server-only).
 */

import { signUpHref } from "@/utils/auth/auth-destination";

/** The query parameter carrying the invitation token. */
export const INVITE_TOKEN_PARAM = "invite";

/**
 * Tokens are `gen_random_uuid()::text` (minted by `inv_create` / `inv_resend`),
 * but the accept ROUTE accepts whatever is in its path, so this stays a shape
 * check rather than a UUID check: bounded length, URL-safe characters only. A
 * value that fails it is dropped — never forwarded, never echoed.
 */
const TOKEN_SHAPE = /^[A-Za-z0-9._~-]{8,200}$/;

/**
 * Read an invitation token out of a query string, a `URLSearchParams`, a Next
 * `searchParams` object, or a `FormData`. Returns `null` unless it is present
 * and token-shaped.
 */
export function readInviteToken(
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
      raw = new URLSearchParams(query).get(INVITE_TOKEN_PARAM);
    } catch {
      return null;
    }
  } else {
    // Duck-typed for the same cross-realm reason as `auth-destination.ts`.
    const getter = (source as { get?: unknown }).get;
    if (typeof getter === "function") {
      raw = (source as { get(k: string): unknown }).get(INVITE_TOKEN_PARAM);
    } else {
      const value = (
        source as Record<string, string | string[] | undefined | null>
      )[INVITE_TOKEN_PARAM];
      raw = Array.isArray(value) ? (value[0] ?? null) : value;
    }
  }
  if (typeof raw !== "string") return null;
  const candidate = raw.trim();
  return TOKEN_SHAPE.test(candidate) ? candidate : null;
}

/**
 * Stamp an invitation token onto an internal auth URL. A missing or
 * wrong-shaped token leaves the URL exactly as it was — the flow still works,
 * it just cannot prefill.
 *
 * This is for AUTH urls (`/sign-up`, `/login`). The accept link itself never
 * needs it: the token is already in its path.
 */
export function withInviteToken(
  authUrl: string,
  token: string | null | undefined,
): string {
  if (typeof token !== "string") return authUrl;
  const candidate = token.trim();
  if (!TOKEN_SHAPE.test(candidate)) return authUrl;
  const [base, hash] = authUrl.split("#");
  const separator = base.includes("?") ? "&" : "?";
  const rebuilt = `${base}${separator}${INVITE_TOKEN_PARAM}=${encodeURIComponent(candidate)}`;
  return hash ? `${rebuilt}#${hash}` : rebuilt;
}

/**
 * Where an ANONYMOUS visitor holding an invitation link must go: sign-up,
 * carrying a destination back to the accept page and the invitation token (so
 * sign-up can prefill the invited address through the peek door). This is the
 * single call every accept page makes — never hand-build a `/login?redirectTo=`
 * for an invitee again.
 *
 * `acceptPath` is the accept route's own path; any query on it is dropped so
 * the destination stays canonical.
 */
export function invitationSignUpHref(
  acceptPath: string,
  token?: string | null,
): string {
  const destination = acceptPath.split("?")[0].split("#")[0];
  return withInviteToken(signUpHref(destination), token);
}
