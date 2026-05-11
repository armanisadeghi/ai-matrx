"use client";

// API keys: ONLY sb_publishable_*. Legacy JWT keys (NEXT_PUBLIC_SUPABASE_HTML_ANON_KEY)
// are DEPRECATED and BANNED in this repo.
// Docs: https://supabase.com/docs/guides/getting-started/api-keys

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let supabaseHtmlInstance: SupabaseClient | null = null;

/**
 * Get or create the Supabase HTML client (singleton pattern)
 * This ensures the client is only created in the browser environment
 */
export function getSupabaseHtml(): SupabaseClient {
  if (supabaseHtmlInstance) {
    console.log(
      "[supabase-html] Returning cached instance, supabaseUrl:",
      (supabaseHtmlInstance as any).supabaseUrl,
    );
    return supabaseHtmlInstance;
  }

  if (typeof window === "undefined") {
    throw new Error(
      "Supabase HTML client can only be initialized in the browser",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_HTML_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_HTML_PUBLISHABLE_KEY;

  console.log("[supabase-html] Creating new client");
  console.log("[supabase-html] URL:", url);
  console.log(
    "[supabase-html] publishableKey present:",
    !!publishableKey,
    "| first 20 chars:",
    publishableKey?.slice(0, 20),
  );

  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase HTML env vars (NEXT_PUBLIC_SUPABASE_HTML_URL, NEXT_PUBLIC_SUPABASE_HTML_PUBLISHABLE_KEY). " +
        "See https://supabase.com/docs/guides/getting-started/api-keys",
    );
  }

  supabaseHtmlInstance = createBrowserClient(url, publishableKey, {
    isSingleton: false,
    auth: {
      storageKey: "sb-html-auth-token",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  console.log(
    "[supabase-html] Client created, supabaseUrl:",
    (supabaseHtmlInstance as any).supabaseUrl,
  );
  return supabaseHtmlInstance;
}

// Export default for backward compatibility
export default getSupabaseHtml;
