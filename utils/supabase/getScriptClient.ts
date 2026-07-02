import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/utils/supabase/env";

// API keys: this file uses ONLY the new sb_publishable_* and sb_secret_* keys.
// The legacy JWT-based NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
// are DEPRECATED and BANNED in this repo — do not reintroduce them
// (ESLint will block it).
// Docs: https://supabase.com/docs/guides/getting-started/api-keys

// Simple client for scripts and non-request contexts
export const getScriptSupabaseClient = () => {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  );
};

// Admin client for migrations (uses the secret key)
export const getAdminSupabaseClient = () => {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
  );
};
