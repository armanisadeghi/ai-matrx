// utils/supabase/client.ts
// Browser client for Supabase - use in Client Components
// https://supabase.com/docs/guides/auth/server-side/nextjs
//
// API keys: this file uses ONLY the new sb_publishable_* key.
// The legacy JWT-based NEXT_PUBLIC_SUPABASE_ANON_KEY is DEPRECATED and BANNED in
// this repo — do not reintroduce it (ESLint will block it).
// Docs: https://supabase.com/docs/guides/getting-started/api-keys

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { wrapClientForCapture } from "@/lib/diagnostics/supabaseErrorCapture";

export function createClient() {
  // Wrapped for global error capture: every .from()/.rpc()/.schema() error is
  // recorded into the diagnostics store (lib/diagnostics/errorCaptureStore.ts)
  // and surfaced in the admin Error Inspector. The wrapper is a no-op on the
  // server and never alters query behavior — see supabaseErrorCapture.ts.
  return wrapClientForCapture(
    createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim(),
    ),
  );
}

// Convenience singleton for files that import { supabase } from '@/utils/supabase/client'
// createBrowserClient already deduplicates internally, so this is safe.
export const supabase = createClient();
