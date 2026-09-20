/**
 * Shared user resolution for API routes and other server-side request paths.
 *
 * TWO doors, ONE verification primitive:
 *
 *  - `resolveUser(request)` — dual-mode: a Bearer token in the Authorization
 *    header (public/mobile clients) or the Supabase session cookie (browser
 *    clients). Returns `{ user }`; `user` is null when auth fails.
 *  - `getClaimsUser(client)` — for a route that has ALREADY built a Supabase
 *    client for its own DB work. Shape-identical to `client.auth.getUser()`
 *    (`{ data: { user }, error }`, with `AuthSessionMissingError` when there is
 *    no session), so it is a drop-in at every call site.
 *
 * `user` carries the JWT's claims with `id` set from `sub`.
 *
 * 🚨 `getClaims()`, NEVER `getUser()`. `getUser()` sends a request to the Auth
 * server for every JWT — a full auth-server round trip on EVERY API request,
 * and nothing dedupes them: React `cache()` is a no-op outside a render, so a
 * route that resolves the caller twice pays twice. The main project signs ES256
 * (its JWKS serves an EC P-256 key), so `getClaims()` verifies the token
 * locally with WebCrypto against a process-wide cached key set and is exactly
 * as trusted: the signature is checked. This is NOT the untrusted
 * `getSession()` read.
 *
 * TWO things the JWT cannot tell you, and both are deliberate:
 *
 *  - A claim is a SNAPSHOT taken when the token was issued. A read-AFTER-WRITE
 *    of `user_metadata` — an `auth.updateUser` followed by echoing the new
 *    state back — must stay on `getUser()`, or it hands the caller the value it
 *    just replaced. `app/api/user/profile/route.ts` is the one such site, and
 *    it says so at the line.
 *  - A revoked session or a deleted user is only noticed when the token
 *    expires, because nothing asks the auth server. That is the same bound the
 *    proxy and `utils/supabase/webDb.ts` already accept, and it is the price of
 *    not making a network call per request. A surface that must refuse a
 *    revoked session WITHIN its access-token lifetime needs `getUser()` and an
 *    entry in `API_ROUTE_ALLOWED` saying why.
 *
 * A call site that needs `created_at`, `updated_at`, `identities`,
 * `last_sign_in_at`, `factors` or `*_confirmed_at` must keep `getUser()` — the
 * JWT has none of them. That is why `utils/supabase/getServerAuth.ts`, the six
 * layouts feeding `utils/userDataMapper.ts`, and `hooks/usePublicAuthSync.ts`
 * still call it. The full contract:
 * `common-docs/systems/platform/proxy-identity/FEATURE.md`.
 *
 * Guard: `pnpm check:proxy-auth-hot-path` (+ `:self-test`).
 *
 * API keys: this file uses ONLY the new sb_publishable_* key.
 * The legacy JWT-based NEXT_PUBLIC_SUPABASE_ANON_KEY is DEPRECATED and BANNED in
 * this repo — do not reintroduce it (ESLint will block it).
 * Docs: https://supabase.com/docs/guides/getting-started/api-keys
 */

import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  AuthSessionMissingError,
  createClient as createSupabaseClient,
  type AuthError,
  type JwtPayload,
  type SupabaseClient,
  type UserAppMetadata,
  type UserMetadata,
} from "@supabase/supabase-js";
import { requireEnv } from "@/utils/supabase/env";

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabasePublishableKey = requireEnv(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

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
export type ClaimsCapableClient = { auth: Pick<SupabaseClient["auth"], "getClaims"> };

/**
 * `client.auth.getUser()` without the auth-server round trip.
 *
 * Returns the SAME envelope `getUser()` does — `{ data: { user }, error }`,
 * with `AuthSessionMissingError` when there is no session — so a call site
 * that branches on `error` alone behaves identically.
 *
 * Pass `jwt` when the token is in hand (a Bearer header) rather than a cookie.
 */
export async function getClaimsUser(
  client: ClaimsCapableClient,
  jwt?: string,
): Promise<{ data: { user: ApiClaimsUser | null }; error: AuthError | null }> {
  const { data, error } = await client.auth.getClaims(jwt);
  if (error) return { data: { user: null }, error };

  const user = userFromClaims(data?.claims);
  if (!user) return { data: { user: null }, error: new AuthSessionMissingError() };
  return { data: { user }, error: null };
}

export async function resolveUser(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const client = createSupabaseClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await getClaimsUser(client, token);
    return { user: data.user };
  }

  const supabase = await createClient();
  const { data } = await getClaimsUser(supabase);
  return { user: data.user };
}

/** The verified claims as a `{ id, ... }` user, or `null` when there are none. */
function userFromClaims(claims: JwtPayload | undefined): ApiClaimsUser | null {
  if (!claims || typeof claims.sub !== "string") return null;
  return {
    ...claims,
    id: claims.sub,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
  };
}
