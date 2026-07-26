// utils/supabase/server.ts
// https://supabase.com/docs/guides/auth/server-side/nextjs
//
// API keys: this file uses ONLY the new sb_publishable_* key.
// The legacy JWT-based NEXT_PUBLIC_SUPABASE_ANON_KEY is DEPRECATED and BANNED in
// this repo — do not reintroduce it (ESLint will block it).
// Docs: https://supabase.com/docs/guides/getting-started/api-keys

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { Database } from "@/types/database.types";
import { requireEnv } from "@/utils/supabase/env";
import { authCookieOptions } from "@/utils/supabase/authCookie";

export async function createClient() {
  const cookieStore = await cookies();
  const host = (await headers()).get("host");

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    {
      // Shared cross-subdomain auth cookie — see utils/supabase/authCookie.ts.
      cookieOptions: authCookieOptions(host),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — proxy handles session refresh instead.
          }
        },
      },
    },
  );
}
