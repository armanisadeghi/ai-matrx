/**
 * unverifiableSession.ts — A SESSION THIS DATABASE CANNOT VERIFY IS ENDED, NOT
 * RETRIED.
 *
 * THE DEFECT (Arman, /marketing on the shared dev server, 2026-10-02). The
 * browser held a session minted by a DIFFERENT auth authority — live vs the
 * nightly clone, or yesterday's clone, each a separate project with its own
 * JWT signing key. Such a token is well-formed and unexpired, so `getSession()`
 * hands it out happily, but the database the page talks to cannot verify it:
 * every read came back `401 PGRST301 "No suitable key or wrong key type"`. The
 * session barrier read that as "no session yet", re-resolved the SAME foreign
 * session, retried, failed again — and logged SESSION_BARRIER_RECOVERED "served,
 * nothing was lost". Meanwhile the chat refused to start ("mandate resolution
 * requires an authenticated session") and the page sat half-working.
 *
 * WHAT THIS DOES. On the first sign — a PGRST301 refusal, or a claims check
 * that the auth authority settled as "this token is not ours" — it asks the
 * authority once (`getClaims`, which verifies the signature against the
 * authority's own keys), and only when that ALSO says the token is
 * unverifiable it ends the session on this device (`signOut({scope:"local"})`,
 * the one sign-out scope this app allows), records it, and sends the person to
 * sign in with one short sentence. An outage (transport failure, spent budget)
 * is never read as a bad token, and an expired token is never treated as
 * foreign — refresh owns that case.
 */

import type { JWK } from "@supabase/supabase-js";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  captureAuthDestination,
  loginHref,
} from "@/utils/auth/auth-destination";
import { pinnedSigningKeysFor } from "@/utils/supabase/projectSigningKeys";

/** The sentence on the sign-in page. Error-state slot: ≤ 140 chars. */
export const UNVERIFIABLE_SESSION_NOTICE =
  "Your session couldn't be verified here. Sign in again.";

interface AuthErrorLike {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
}

interface RefusalLike {
  error?: { code?: string; message?: string } | null;
  status?: number;
}

/**
 * Is this PostgREST result the database saying "I cannot verify this token"?
 * PGRST301 at 401 is a token that failed to decode or verify (wrong key,
 * bad signature). Expiry is PGRST303 on current PostgREST; older builds said
 * "JWT expired" under PGRST301, which refresh repairs — so it is excluded.
 */
export function isUnverifiableTokenRefusal(result: RefusalLike): boolean {
  if (result.status !== 401) return false;
  if (result.error?.code !== "PGRST301") return false;
  return !/expired/i.test(result.error?.message ?? "");
}

/**
 * Is this `getClaims()` error the authority's SETTLED verdict that the token
 * is not one of its own? `bad_jwt` is GoTrue's answer for a token signed by an
 * unknown key; `AuthInvalidJwtError` is auth-js's local signature failure.
 * Transport failures, a spent budget, a missing session and expiry are not.
 */
export function isUnverifiableTokenError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  const name = String(error.name ?? "");
  if (name === "AuthRetryableFetchError" || name === "TimeoutError" || name === "AbortError") {
    return false;
  }
  if (name === "AuthSessionMissingError" || error.code === "session_not_found") return false;
  const status = error.status;
  if (status === 0 || status === 408 || status === 503 || status === 504) return false;
  if (/expired/i.test(error.message ?? "")) return false;
  return error.code === "bad_jwt" || name === "AuthInvalidJwtError";
}

export interface UnverifiableSessionAuth {
  getClaims(
    jwt?: string,
    options?: { jwks?: { keys: JWK[] } },
  ): Promise<{ data: unknown; error: AuthErrorLike | null }>;
  signOut(options: { scope: "local" }): Promise<unknown>;
}

/** Ask the authority once: is the stored session's token one it can verify? */
export async function confirmUnverifiableSession(
  auth: Pick<UnverifiableSessionAuth, "getClaims">,
): Promise<boolean> {
  try {
    const { error } = await auth.getClaims(undefined, {
      jwks: { keys: pinnedSigningKeysFor(process.env.NEXT_PUBLIC_SUPABASE_URL) },
    });
    return isUnverifiableTokenError(error);
  } catch {
    return false;
  }
}

/** Where the person is sent: sign-in, carrying the page they were on. */
export function unverifiableSessionLoginHref(pathname: string, search: string): string {
  const href = loginHref(captureAuthDestination(pathname, search));
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("error", UNVERIFIABLE_SESSION_NOTICE);
  return `${path}?${params.toString()}`;
}

let ending: Promise<void> | null = null;
let navigateTo: (href: string) => void = (href) => window.location.assign(href);

/** Test seam — forget the single flight; optionally observe the navigation. */
export function resetUnverifiableSessionForTests(navigate?: (href: string) => void): void {
  ending = null;
  navigateTo = navigate ?? ((href) => window.location.assign(href));
}

/**
 * End the unverifiable session on this device and send the person to sign
 * in. Single-flight: a page's twenty refused reads end it once.
 */
export function endUnverifiableSession(
  auth: Pick<UnverifiableSessionAuth, "signOut">,
  where: { door: string; via: "postgrest" | "claims" },
): Promise<void> {
  if (ending) return ending;
  ending = (async () => {
    captureError({
      source: "supabase-postgrest",
      operation: "unknown",
      code: "SESSION_UNVERIFIABLE",
      message:
        `${where.door} was refused because this browser's session was minted by a ` +
        `different auth authority than the database this page talks to (seen via ` +
        `${where.via}). The session was ended on this device and the person was ` +
        `sent to sign in.`,
      status: 401,
      sessionState: "pre_attach",
      durable: true,
    });
    try {
      await auth.signOut({ scope: "local" });
    } catch {
      /* the redirect still happens; a stale cookie is re-checked there */
    }
    // Already on sign-in: the session is gone, and navigating again could only
    // loop if a cookie outlived the sign-out.
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      navigateTo(unverifiableSessionLoginHref(window.location.pathname, window.location.search));
    }
  })();
  return ending;
}
