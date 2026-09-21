// utils/supabase/authUserRecord.ts — THE ONE server door to the auth server's
// user RECORD. This is the only place under `utils/`, `app/`, `features/`,
// `lib/`, `components/`, `hooks/` or `providers/` where `.auth.getUser(` may
// appear on the server (the guard `check:proxy-auth-hot-path` enforces it and
// names the callers allowed to reach this door).
//
// WHEN THIS IS THE RIGHT CALL — and there are only two reasons:
//
//  1. A read-AFTER-WRITE of `auth.updateUser`. The JWT's `user_metadata` is a
//     snapshot from token issuance; only the auth server knows what was just
//     saved. (`app/api/user/profile/route.ts`, PATCH echo.)
//  2. A surface that must refuse a REVOKED session inside the access token's
//     lifetime. Nothing in this repo needs that today; if one does, add it to
//     the guard's allow-list with the sentence that says why.
//
// For "who is the caller" use `getServerAuth()` / `getClaimsUser()`. For the
// fields the JWT does not carry (`created_at`, `identities`, `last_sign_in_at`,
// `*_confirmed_at`, `factors`) use the BROWSER door, once, after hydration
// (`utils/supabase/authUserRecord.client.ts`) — never on a page render.
//
// The call is bounded: the server client from `@ai-matrx/data/next` puts one
// identity budget on `/auth/v1/user` and on a token refresh, so a stalled auth
// server costs this call its answer, not the request its response.

import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function fetchAuthUserRecord(
  client: Pick<SupabaseClient, "auth">,
): Promise<{ user: User | null; error: Error | null }> {
  const { data, error } = await client.auth.getUser();
  return { user: data.user ?? null, error: error ?? null };
}
