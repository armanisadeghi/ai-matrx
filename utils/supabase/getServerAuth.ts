// utils/supabase/getServerAuth.ts — THE server identity door.
//
// Every Server Component, layout, page, Server Action and server-side service
// that needs "who is this, and are they signed in" calls this and nothing else.
// It resolves the caller from the access token's claims, verified LOCALLY
// against the project JWKS (`getClaimsUser`), so a page render makes NO
// auth-server round trip — and the whole tree shares one resolve per request
// through React's `cache()`.
//
// 🚨 HISTORY, so nobody puts it back. Until 2026-09-21 this helper called
// `supabase.auth.getUser()`: one network call to the auth server per page
// render, with no timeout, and auth-js retrying a stalled refresh for up to
// 30s. When the database locked up that morning every layout on it timed out
// at Vercel's 15s cap and people saw `504 FUNCTION_INVOCATION_TIMEOUT`. The
// proxy had already been fixed the day before; this door had not. The guard
// `check:proxy-auth-hot-path` now refuses `.auth.getUser(` everywhere except
// the one allow-listed door, `utils/supabase/authUserRecord*.ts`.
//
// What the JWT does NOT carry — `created_at`, `identities`, `last_sign_in_at`,
// `*_confirmed_at`, `factors` — is not this door's business. A surface that
// shows one of those reads it through `fetchAuthUserRecord` from the client,
// once, after hydration (`features/shell/components/DeferredShellData.tsx`).
//
// Usage:
//
//     const { isAuthenticated, user, authUnavailable } = await getServerAuth();
//
// 🚨 `authUnavailable` is the difference between "nobody is signed in" and
// "we could not tell". When it is true, `user` is null but the person is NOT
// signed out: never bounce to /login and never say "signed out" as if it were
// settled. The proxy applies the same rule. A SCREEN does not read this door at
// all: it reads `getSessionVerdict()` / `readSessionVerdict()` from
// `./sessionVerdict` (guard: scripts/check-session-verdict.ts). Only the shell
// layouts that hold in place read `authUnavailable` here directly.

import { cache } from "react";
import { createClient } from "./server";
import {
  getClaimsUser,
  isAuthTransportFailure,
  type ApiClaimsUser,
} from "./claimsUser";
import { PROJECT_SIGNING_KEYS } from "./projectSigningKeys";

export interface ServerAuthState {
  /** `true` when the request carries a locally verified access token. */
  isAuthenticated: boolean;
  /**
   * The verified caller — the JWT's claims with `id` set from `sub` — or
   * `null` for guests and for an unresolvable request (see `authUnavailable`).
   */
  user: ApiClaimsUser | null;
  /**
   * `true` when we could not REACH a verdict — the auth authority or the JWKS
   * endpoint was unreachable, or this request's 2.5s identity budget was spent.
   *
   * 🚨 NOT set for a token we DID reach a verdict on. A badly-signed, forged or
   * expired-key token is a settled answer ("this is not a valid session"), and
   * calling it "unavailable" would hold the person on "reload in a moment"
   * forever while the proxy sends the same request to /login. Same line the
   * package draws for `MiddlewareSession.authUnavailable`.
   */
  authUnavailable: boolean;
}

/** How long the one retry waits before asking again. Short: the budget that
 *  was spent is usually a cold function's first fetch, not a dead authority. */
const RETRY_AFTER_MS = 250;

async function resolveOnce(): Promise<ServerAuthState> {
  // A fresh client per attempt: the 2.5s identity budget belongs to the client
  // (`createAuthBudget`), so a retry on the same client would be refused at once.
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await getClaimsUser(supabase, undefined, {
    // Pinned public key: a cold function verifies with no JWKS fetch (the
    // fetch that spent the budget on first loads — see projectSigningKeys.ts).
    jwks: { keys: PROJECT_SIGNING_KEYS },
  });
  // Mirror the proxy exactly: unavailable means UNREACHABLE (or a spent
  // budget), never "the token was bad". See `isAuthTransportFailure`.
  const authUnavailable = !user && error !== null && isAuthTransportFailure(error);
  if (authUnavailable) {
    console.warn(
      "[getServerAuth] identity could not be verified on this attempt — rendering " +
        `without a user, NOT as signed out. Cause: ${error?.name ?? "unknown"}: ${error?.message ?? ""}`,
    );
  }
  return { isAuthenticated: !!user, user, authUnavailable };
}

/**
 * 🚨 WAIT AND RETRY ONCE (lane SESSION-VERDICT, 2026-09-24). "Could not verify"
 * is almost always one cold first load spending its budget — the next attempt,
 * a moment later, answers. So the door asks twice before it hands anyone the
 * third state. What is still `authUnavailable` after this is a real outage, and
 * a screen reads it through `getSessionVerdict()` (`./sessionVerdict`), never
 * as "not signed in". Guard: `tsx scripts/check-session-verdict.ts --strict` (+ its jest test).
 */
export const getServerAuth = cache(async (): Promise<ServerAuthState> => {
  const first = await resolveOnce();
  if (!first.authUnavailable) return first;
  await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
  const second = await resolveOnce();
  if (!second.authUnavailable) {
    console.warn("[getServerAuth] identity verified on the retry — the first attempt's budget was spent.");
  }
  return second;
});
