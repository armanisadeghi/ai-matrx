import { createClient } from "@supabase/supabase-js";

// API keys: this file uses ONLY the new sb_publishable_* and sb_secret_* keys.
// The legacy JWT-based NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
// are DEPRECATED and BANNED in this repo — do not reintroduce them
// (ESLint will block it).
// Docs: https://supabase.com/docs/guides/getting-started/api-keys

// Simple client for scripts and non-request contexts
export const getScriptSupabaseClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim(),
  );
};

// Admin client for migrations (uses the secret key)
export const getAdminSupabaseClient = () => {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is required for admin operations");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey);
};
