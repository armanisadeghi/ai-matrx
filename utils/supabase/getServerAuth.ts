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
// signed out: render the guest shell if you must, never bounce to /login and
// never say "signed out" as if it were settled. The proxy applies the same rule.

import { cache } from "react";
import { createClient } from "./server";
import { getClaimsUser, type ApiClaimsUser } from "./claimsUser";

export interface ServerAuthState {
  /** `true` when the request carries a locally verified access token. */
  isAuthenticated: boolean;
  /**
   * The verified caller — the JWT's claims with `id` set from `sub` — or
   * `null` for guests and for an unresolvable request (see `authUnavailable`).
   */
  user: ApiClaimsUser | null;
  /**
   * `true` when the token could not be VERIFIED (auth authority or JWKS
   * unreachable, malformed token) as opposed to there being no token at all.
   */
  authUnavailable: boolean;
}

export const getServerAuth = cache(async (): Promise<ServerAuthState> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await getClaimsUser(supabase);
  const authUnavailable = !user && error !== null;
  if (authUnavailable) {
    console.warn(
      "[getServerAuth] identity could not be verified on this request — rendering " +
        `without a user, NOT as signed out. Cause: ${error?.name ?? "unknown"}: ${error?.message ?? ""}`,
    );
  }
  return { isAuthenticated: !!user, user, authUnavailable };
});
