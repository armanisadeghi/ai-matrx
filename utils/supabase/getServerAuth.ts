// utils/supabase/getServerAuth.ts
//
// Request-scoped cached `getUser()` for Server Components / Server Actions.
//
// Background: Next.js 16 layouts and pages are independent server boundaries.
// Each one that needs the current user calls `createClient()` + `auth.getUser()`
// — without deduplication, a single page render fires the JWT validation
// round-trip N times (root layout, route-group layout, segment layout, page).
//
// React's request-scoped `cache()` solves this cleanly: the first call within
// a request hits Supabase, every subsequent call in the SAME request returns
// the cached promise. Outside of React's request scope (route handlers,
// middleware), `cache()` is a no-op pass-through — safe to call from anywhere.
//
// Usage:
//
//     import { getServerAuth } from "@/utils/supabase/getServerAuth";
//     const { isAuthenticated, user } = await getServerAuth();
//
// The proxy (`utils/supabase/middleware.ts`) refreshes the cookie BEFORE the
// layout chain runs, so by the time this helper executes, the cookie is fresh
// and `getUser()` returns the validated user without a 401-then-refresh dance.

import { cache } from "react";
import { createClient } from "./server";
import type { User } from "@supabase/supabase-js";

export interface ServerAuthState {
  /** `true` when the request has a validated Supabase user. */
  isAuthenticated: boolean;
  /** The validated Supabase user, or `null` for guests. */
  user: User | null;
}

export const getServerAuth = cache(async (): Promise<ServerAuthState> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { isAuthenticated: !!user, user };
});
