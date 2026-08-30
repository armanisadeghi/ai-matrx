// utils/supabase/authCookie.ts — the ONE binding of @ai-matrx/data/next to
// THIS app's identity. Everything below is a value: our apex domain, our
// cookie names, our error-capture wrapper. Every hard part — cookie option
// construction, the domain-wide span, the SSR/browser split, the browser
// singleton, the legacy-key rename migration, the whole middleware session
// dance — lives in the package (`@ai-matrx/data/next`), where every other
// Matrx app inherits it. Full WHY lives in the package module headers.
//
// API keys: this app uses ONLY the new sb_publishable_* key. The legacy
// JWT-based NEXT_PUBLIC_SUPABASE_ANON_KEY is DEPRECATED and BANNED in this
// repo — do not reintroduce it (ESLint will block it).
// Docs: https://supabase.com/docs/guides/getting-started/api-keys

import { createNextSupabase } from "@ai-matrx/data/next";
import type { AuthCookieValue } from "@ai-matrx/data/next";
import type { CookieOptionsWithName } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { wrapClientForCapture } from "@/lib/diagnostics/supabaseErrorCapture";

/**
 * The West and East Supabase projects are different auth authorities. A
 * pre-cutover tab can keep running the West bundle for days, so sharing one
 * storage key lets that tab overwrite the East session at the next refresh.
 * Bump the cookie name whenever the Supabase auth authority is replaced, and
 * move the previous name to `legacyCookieName`.
 */
export const LEGACY_AUTH_COOKIE_NAME = "sb-matrx-auth";

export const supabaseNext = createNextSupabase<Database>({
  // STATIC member accesses — Next only inlines NEXT_PUBLIC_* into client
  // bundles for those; a dynamic lookup is undefined in every browser bundle.
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  apexDomain: "aimatrx.com",
  cookieName: "sb-matrx-auth-v2",
  legacyCookieName: LEGACY_AUTH_COOKIE_NAME,
  // Every .from()/.rpc()/.schema() error is recorded into the diagnostics
  // store (lib/diagnostics/errorCaptureStore.ts) and surfaced in the admin
  // Error Inspector. The wrapper is a no-op on the server and never alters
  // query behavior — see supabaseErrorCapture.ts.
  wrapBrowserClient: (client) =>
    typeof client === "object" && client !== null
      ? wrapClientForCapture(client)
      : client,
});

export const AUTH_COOKIE_NAME = supabaseNext.cookieName;

/**
 * Cookie options for the host serving the current request.
 * @param host `Host` header or `window.location.hostname` (port tolerated).
 */
export function authCookieOptions(
  host: string | null | undefined,
): CookieOptionsWithName {
  return supabaseNext.optionsForHost(host);
}

/** Browser variant — resolves the host from `window` (SSR-safe). */
export function browserAuthCookieOptions(): CookieOptionsWithName {
  return supabaseNext.browserOptions();
}

export function isCurrentAuthCookie(name: string): boolean {
  return supabaseNext.authCookie.isCurrentCookie(name);
}

/** Compatibility export for focused cookie-contract tests and callers. */
export function legacyAuthCookieMigration(
  cookies: readonly AuthCookieValue[],
): AuthCookieValue[] {
  return supabaseNext.authCookie.migrateLegacyCookies(cookies);
}
