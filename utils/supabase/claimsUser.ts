// utils/supabase/claimsUser.ts — THE identity read every server and client
// path shares. Verifies the access token LOCALLY (WebCrypto against the
// project's cached JWKS; the main project signs ES256) and never asks the
// auth server who the caller is.
//
// This file imports nothing from `next/headers`, so a Client Component, a
// hook, a Server Action, a layout and an API route can all use it. The
// server-only conveniences (`getServerAuth`, `resolveUser`) are thin wrappers
// over this one function.
//
// 🚨 `getClaims()`, NEVER `getUser()`. `getUser()` is one network round trip
// to the auth server PER CALL, with auth-js retrying a stalled refresh for up
// to 30s. On 2026-09-20 that put `504 MIDDLEWARE_INVOCATION_TIMEOUT` in front
// of real people; on 2026-09-21 a locked database did it again to every page
// whose layout still called it. The whole class is closed by construction:
// `.auth.getUser(` may exist in exactly the files `check:proxy-auth-hot-path`
// allow-lists, and those wrap it as `fetchAuthUserRecord` — the ONE door for
// the fields the JWT does not carry (`created_at`, `identities`,
// `last_sign_in_at`, `*_confirmed_at`, `factors`) and for a read-after-write of
// `auth.updateUser`.
//
// Contract: `common-docs/systems/platform/proxy-identity/FEATURE.md`.

import {
  AuthError,
  AuthSessionMissingError,
  type JwtPayload,
  type SupabaseClient,
  type UserAppMetadata,
  type UserMetadata,
} from "@supabase/supabase-js";

/**
 * The verified caller, built from the access token's claims.
 *
 * Every field here IS a JWT claim. `id` is `sub`, restated under the name every
 * call site already reads. `app_metadata` / `user_metadata` are defaulted to
 * `{}` so a reader never has to null-check what `getUser()` always handed it.
 */
export interface ApiClaimsUser extends JwtPayload {
  /** The `sub` claim — the user id. */
  id: string;
  app_metadata: UserAppMetadata;
  user_metadata: UserMetadata;
}

/** Any Supabase client — the only thing this door needs is `auth.getClaims`. */
export type ClaimsCapableClient = {
  auth: Pick<SupabaseClient["auth"], "getClaims">;
};

/**
 * `client.auth.getUser()` without the auth-server round trip.
 *
 * Returns the SAME envelope `getUser()` does — `{ data: { user }, error }` —
 * with ONE deliberate distinction the round trip never drew:
 *
 *  - CONFIRMED SIGNED OUT (no session, no token) → `{ user: null, error: null }`.
 *    That is a settled fact, and a route is entitled to say "sign in again"
 *    rather than "try again later".
 *  - COULD NOT VERIFY (auth server / JWKS unreachable, a malformed or
 *    badly-signed token, any other verification failure, or a token that
 *    verified but carries no `sub`) → the `error` is kept, so a retry branch
 *    still fires and a screen never paints "signed out" over an outage.
 *
 * Pass `jwt` when the token is in hand (a Bearer header) rather than a cookie.
 */
export async function getClaimsUser(
  client: ClaimsCapableClient,
  jwt?: string,
): Promise<{ data: { user: ApiClaimsUser | null }; error: AuthError | null }> {
  const { data, error } = await client.auth.getClaims(jwt);
  // supabase-js reports "there is no session here" as AuthSessionMissingError.
  // That is an answer, not an outage.
  if (error) {
    if (isSignedOutError(error)) return { data: { user: null }, error: null };
    return { data: { user: null }, error };
  }

  // No claims at all: getClaims() ran, found no token to verify, and said so.
  if (!data?.claims) return { data: { user: null }, error: null };

  const user = userFromClaims(data.claims);
  // A token that VERIFIED but carries no subject is malformed, not signed out.
  if (!user) {
    return {
      data: { user: null },
      error: new AuthError("Verified token carries no `sub` claim", 401, "bad_jwt"),
    };
  }
  return { data: { user }, error: null };
}

/**
 * Is this `getClaims()` error an authority we could not REACH, as opposed to a
 * token we could reach a verdict on?
 *
 * 🚨 THIS IS THE LINE `authUnavailable` DRAWS, and getting it wrong is costly in
 * BOTH directions:
 *
 *  - Too NARROW (only transport, but missing a case) → a real outage reads as a
 *    logout: signed-in people bounced to /login by a network blink.
 *  - Too WIDE (any error at all) → a genuinely BAD token — forged, corrupted,
 *    signed by a rotated key — reads as an outage. The person is then held on
 *    "reload in a moment" forever and NEVER told to sign in again, while the
 *    proxy, which draws the line correctly, bounces the same request to /login.
 *    Two halves of the app disagreeing about one request is worse than either
 *    answer alone. Verified live on 2026-09-21 by presenting a badly-signed
 *    token: the proxy redirected to /login while `getServerAuth` was calling it
 *    `authUnavailable`.
 *
 * This MIRRORS `isAuthTransportFailure` in `@ai-matrx/data/next`, which the
 * package does not currently export (0.18.0). Keep the two in step; if they
 * ever disagree, the package is right — it is what the proxy runs on.
 */
export function isAuthTransportFailure(error: AuthError): boolean {
  const name = String(error.name ?? "");
  if (name === "AuthRetryableFetchError" || name === "TimeoutError" || name === "AbortError") {
    return true;
  }
  const status = error.status;
  if (status === 0 || status === 504 || status === 503) return true;
  // 408 / `auth_budget_exhausted` is the synthetic answer `createAuthBudget`
  // returns once the request's 2.5s identity budget is spent.
  return status === 408 || error.code === "auth_budget_exhausted";
}

/** Is this `getClaims()` error the settled fact "nobody is signed in"? */
export function isSignedOutError(error: AuthError): boolean {
  return (
    error instanceof AuthSessionMissingError ||
    error.name === "AuthSessionMissingError" ||
    error.code === "session_not_found"
  );
}

/** The verified claims as a `{ id, ... }` user, or `null` when there are none. */
export function userFromClaims(claims: JwtPayload | undefined): ApiClaimsUser | null {
  if (!claims || typeof claims.sub !== "string") return null;
  return {
    ...claims,
    id: claims.sub,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
  };
}
