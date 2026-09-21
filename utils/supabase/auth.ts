// utils/supabase/auth.ts
// Client-side auth utilities using the browser Supabase client

import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { pgErrorToError } from "@ai-matrx/data";

export type Provider = "github" | "google" | "apple";

export const signInWithOAuth = async (provider: Provider) => {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
    });

    if (error) {
      throw pgErrorToError(error);
    }
    return data;
  } catch (error) {
    console.error("Error in signInWithOAuth:", error);
    return null;
  }
};

/**
 * The signed-in caller, from the access token's LOCALLY VERIFIED claims.
 *
 * 🚨 This used to be `supabase.auth.getUser()` — one auth-server round trip per
 * call. It returns `ApiClaimsUser` (the JWT's claims: `id`, `email`, `phone`,
 * `is_anonymous`, `app_metadata`, `user_metadata`...), NOT the auth-server
 * record: `created_at`, `identities`, `last_sign_in_at` and `*_confirmed_at`
 * are not in a JWT and arrive in Redux through `fetchAuthUserRecord`.
 */
export async function getUser() {
  const supabase = createClient();
  const { data, error } = await getClaimsUser(supabase);
  if (error || !data?.user) {
    return null;
  }
  return data.user;
}

export const updateUser = async (email: string) => {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({
      email,
    });
    if (error) {
      throw pgErrorToError(error);
    }
    return data;
  } catch (error) {
    console.error("Error in updateUser:", error);
    return null;
  }
};

export const linkIdentity = async (provider: Provider) => {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
    });
    if (error) {
      throw pgErrorToError(error);
    }
    return data;
  } catch (error) {
    console.error("Error in linkIdentity:", error);
    return null;
  }
};
