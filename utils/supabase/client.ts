// utils/supabase/client.ts
// Browser client for Supabase - use in Client Components.
//
// Construction, the shared cross-subdomain auth cookie, the error-capture
// wrapper, and the singleton all live in @ai-matrx/data/next, bound to this
// app's identity in utils/supabase/authCookie.ts. This file is the repo's
// established import name for that door and nothing more.

import { supabaseNext } from "@/utils/supabase/authCookie";

export function createClient() {
  return supabaseNext.browserClient();
}

// Convenience singleton for files that import { supabase } from '@/utils/supabase/client'
export const supabase = createClient();
