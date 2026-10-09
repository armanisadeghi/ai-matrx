"use client";
// lib/guest/guest-supabase-client.ts — the browser client that holds the GUEST session (G2 guest data).
// Read only by the Applet host for a signed-out visitor; see guest-cookie.ts for why it is its own cookie.
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import { wrapClientForCapture } from "@/lib/diagnostics/supabaseErrorCapture";
import { GUEST_AUTH_COOKIE } from "@/lib/guest/guest-cookie";

let client: SupabaseClient<Database> | null = null;

export function guestSupabase(): SupabaseClient<Database> {
  client ??= wrapClientForCapture(
    createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
      {
        // NOT the app's singleton: that one holds the main auth cookie.
        isSingleton: false,
        cookieOptions: {
          name: GUEST_AUTH_COOKIE,
          path: "/",
          sameSite: "lax",
          secure: typeof window !== "undefined" && window.location.protocol === "https:",
          maxAge: 60 * 60 * 24 * 400,
        },
      },
    ),
  );
  return client;
}
