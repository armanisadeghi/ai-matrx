// utils/supabase/authUserRecord.client.ts — THE ONE browser door to the auth
// server's user RECORD, for the fields the JWT does not carry: `created_at`,
// `identities`, `last_sign_in_at`, `email_confirmed_at`, `phone_confirmed_at`,
// `factors`. Called ONCE per browser session, after hydration, by the shell
// (`features/shell/components/DeferredShellData.tsx` for the signed-in shell,
// `hooks/usePublicAuthSync.ts` for public routes); the result lands in Redux
// and every profile / menu surface reads it from there.
//
// It is NOT an identity check. "Is this person signed in, and who are they" is
// answered locally from the access token — `getClaimsUser(createClient())` in
// the browser, `getServerAuth()` on the server — with no network call.
//
// `check:proxy-auth-hot-path` allow-lists `.auth.getUser(` in this file only
// (plus its server twin and the profile PATCH echo) and names the callers
// allowed to import it. A new caller is a guard change with a reason, not an
// import.
"use client";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

export async function fetchAuthUserRecord(): Promise<{
  user: User | null;
  error: Error | null;
}> {
  const { data, error } = await createClient().auth.getUser();
  return { user: data.user ?? null, error: error ?? null };
}
