/**
 * Shared user resolution for API routes.
 *
 * Supports dual-mode authentication:
 * 1. Bearer token in Authorization header (public/mobile clients)
 * 2. Supabase session cookie (browser clients)
 *
 * Returns `{ user }` — user is null when auth fails. `user` carries the JWT's
 * claims with `id` set from `sub`; every caller reads `id`/`email`.
 *
 * 🚨 `getClaims()`, NEVER `getUser()`. `getUser()` sends a request to the Auth
 * server for every JWT — a full auth-server round trip on every API request
 * through this door, and the Bearer path made a fresh client to do it. The main
 * project signs ES256 (its JWKS serves an EC P-256 key), so `getClaims()`
 * verifies the token locally with WebCrypto against a process-wide cached key
 * set and is exactly as trusted: the signature is checked. This is NOT the
 * untrusted `getSession()` read.
 *
 * A call site that needs `created_at`, `identities`, `last_sign_in_at`,
 * `factors` or `*_confirmed_at` must keep `getUser()` — the JWT has none of
 * them. The full contract:
 * `common-docs/systems/platform/proxy-identity/FEATURE.md`.
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
    const { data, error } = await client.auth.getClaims(token);
    return { user: error ? null : userFromClaims(data?.claims) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  return { user: error ? null : userFromClaims(data?.claims) };
}

/** The verified claims as a `{ id, ... }` user, or `null` when there are none. */
function userFromClaims(
  claims: Record<string, unknown> | undefined,
): ({ id: string } & Record<string, unknown>) | null {
  if (!claims || typeof claims.sub !== "string") return null;
  return { ...claims, id: claims.sub };
}
