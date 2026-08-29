// utils/supabase/authCookie.ts — the HOST WIRING for @ai-matrx/data's
// auth-cookie primitive. All cookie logic lives in the package
// (`createAuthCookie`); this module only binds it to OUR apex domain and
// keeps the repo's established export names. Every Supabase client in this
// repo (browser, server, middleware, and the admin OAuth callback) MUST pass
// these options — a client using the default cookie name cannot see the
// session the others wrote. Full WHY (the 2026-07 deployment split, the
// rename, the Domain rules) lives in the package module's header.

import { createAuthCookie } from "@ai-matrx/data/db";
import type { CookieOptionsWithName } from "@supabase/ssr";

const authCookie = createAuthCookie({ apexDomain: "aimatrx.com" });

export const AUTH_COOKIE_NAME = authCookie.cookieName;

/**
 * Cookie options for the host serving the current request.
 * @param host `Host` header or `window.location.hostname` (port tolerated).
 */
export function authCookieOptions(
  host: string | null | undefined,
): CookieOptionsWithName {
  return authCookie.optionsForHost(host);
}

/** Browser variant — resolves the host from `window` (SSR-safe). */
export function browserAuthCookieOptions(): CookieOptionsWithName {
  return authCookie.browserOptions();
}
