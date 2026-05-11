/**
 * Shared user resolution for API routes.
 *
 * Supports dual-mode authentication:
 * 1. Bearer token in Authorization header (public/mobile clients)
 * 2. Supabase session cookie (browser clients)
 *
 * Returns `{ user }` — user is null when auth fails.
 *
 * API keys: this file uses ONLY the new sb_publishable_* key.
 * The legacy JWT-based NEXT_PUBLIC_SUPABASE_ANON_KEY is DEPRECATED and BANNED in
 * this repo — do not reintroduce it (ESLint will block it).
 * Docs: https://supabase.com/docs/guides/getting-started/api-keys
 */

import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim();

export async function resolveUser(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const client = createSupabaseClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);
    return { user: error ? null : user };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user: error ? null : user };
}
