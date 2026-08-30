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

/**
 * The West and East Supabase projects are different auth authorities. A
 * pre-cutover tab can keep running the West bundle for days, so sharing one
 * storage key lets that tab overwrite the East session at the next refresh.
 * Bump this name whenever the Supabase auth authority is replaced.
 */
export const LEGACY_AUTH_COOKIE_NAME = "sb-matrx-auth";

const authCookie = createAuthCookie({
  apexDomain: "aimatrx.com",
  cookieName: "sb-matrx-auth-v2",
});

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

export interface AuthCookieValue {
  name: string;
  value: string;
}

function renamedCookie(
  cookie: AuthCookieValue,
  from: string,
  to: string,
): AuthCookieValue | null {
  if (cookie.name === from) return { ...cookie, name: to };
  const prefix = `${from}.`;
  if (!cookie.name.startsWith(prefix)) return null;
  const chunk = cookie.name.slice(prefix.length);
  if (!/^(0|[1-9][0-9]*)$/.test(chunk)) return null;
  return { ...cookie, name: `${to}.${chunk}` };
}

export function isCurrentAuthCookie(name: string): boolean {
  return (
    name === AUTH_COOKIE_NAME ||
    new RegExp(
      `^${AUTH_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(0|[1-9][0-9]*)$`,
    ).test(name)
  );
}

/**
 * Seed the new storage key only when it is absent. Proxy validates the seeded
 * token against East before it ever persists these cookies to the response.
 */
export function legacyAuthCookieMigration(
  cookies: readonly AuthCookieValue[],
): AuthCookieValue[] {
  if (cookies.some(({ name }) => isCurrentAuthCookie(name))) return [];
  return cookies.flatMap((cookie) => {
    const renamed = renamedCookie(
      cookie,
      LEGACY_AUTH_COOKIE_NAME,
      AUTH_COOKIE_NAME,
    );
    return renamed ? [renamed] : [];
  });
}
