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
 *    (`{ data: { user }, error }`), so it is a drop-in at every call site.
 *
 * 🚨 SIGNED OUT IS AN ANSWER, NOT A FAILURE. `{ user: null, error: null }`
 * means the verification RAN and settled: there is no session and no token.
 * `error` is reserved for "we could not tell" — the auth server or JWKS was
 * unreachable, the token was malformed, the token verified but carries no
 * `sub`. A route may therefore answer a settled signed-out caller with an
 * honest 401 ("sign in again") and keep a transient-sounding 503 for the cases
 * that really are transient. This door used to hand back
 * `AuthSessionMissingError` for a CONFIRMED signed-out caller, which made
 * `app/api/google/oauth/redirect-state` — which branches on `error` FIRST to
 * offer a retry — tell signed-out users their session "could not be verified
 * yet" and invite them to retry forever.
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
 * still call it. That was true until 2026-09-21; every one of them now reads
 * `getServerAuth()` (claims) and the four fields arrive on the client through
 * `fetchAuthUserRecord`, the ONE allow-listed door. The full contract:
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
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/utils/supabase/env";
import { getClaimsUser } from "@/utils/supabase/claimsUser";

// The verification primitive itself lives in `utils/supabase/claimsUser.ts`
// (client-safe: no `next/headers`). Re-exported here so every existing
// `@/utils/supabase/resolveUser` import keeps working unchanged.
export {
  getClaimsUser,
  isSignedOutError,
  userFromClaims,
  type ApiClaimsUser,
  type ClaimsCapableClient,
} from "@/utils/supabase/claimsUser";

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabasePublishableKey = requireEnv(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

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
