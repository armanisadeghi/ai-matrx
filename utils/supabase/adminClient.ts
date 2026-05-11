// utils/supabase/adminClient.ts
// Admin client for server-side operations that bypass RLS.
//
// API keys: this file uses ONLY the new sb_secret_* key.
// The legacy JWT-based SUPABASE_SERVICE_ROLE_KEY is DEPRECATED and BANNED in
// this repo — do not reintroduce it (ESLint will block it).
// Docs: https://supabase.com/docs/guides/getting-started/api-keys

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Creates an admin Supabase client with the secret key.
 * This bypasses RLS and should only be used in server-side code
 * with proper validation.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  if (!supabaseServiceKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not configured. Please add it to your .env.local file.",
    );
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
