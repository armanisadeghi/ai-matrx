// utils/supabase/authCookie.ts
//
// Shared auth-cookie options for EVERY Supabase client in this repo
// (browser, server, middleware, and the admin OAuth callback). All five
// construction sites MUST pass these options — a client using the default
// cookie name cannot see the session the others wrote.
//
// WHY (2026-07 deployment split): one login must work on every
// *.aimatrx.com host — aimatrx.com, manage.aimatrx.com, demos.aimatrx.com,
// learn.aimatrx.com — so on those hosts the auth cookie is issued
// domain-wide (`Domain=.aimatrx.com`) instead of Supabase's default
// host-only cookie.
//
// The cookie is also RENAMED (default `sb-<project-ref>-auth-token` →
// `sb-matrx-auth`): re-issuing an existing host-only cookie as domain-wide
// under the SAME name leaves two same-name cookies in the browser (different
// Domain attributes = distinct cookies), and whichever the browser sends
// first wins — auth flaps. A new name makes the transition deterministic:
// every user re-logs-in exactly once and the old cookie expires unused.
// The `sb-` prefix is kept on purpose — cleanup paths (e.g. the admin OAuth
// callback's denied-response scrub) delete session cookies by that prefix.
//
// The Domain attribute is ONLY set on real *.aimatrx.com hosts. localhost
// and *.vercel.app previews get a host-only cookie — a browser rejects any
// Set-Cookie whose Domain does not cover the current host, so setting it
// unconditionally would silently break auth everywhere else.

import type { CookieOptionsWithName } from "@supabase/ssr";

export const AUTH_COOKIE_NAME = "sb-matrx-auth";

const APEX_DOMAIN = "aimatrx.com";

/**
 * Cookie options for the host serving the current request.
 * @param host `Host` header or `window.location.hostname` (port tolerated).
 */
export function authCookieOptions(
  host: string | null | undefined,
): CookieOptionsWithName {
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  const onApex =
    hostname === APEX_DOMAIN || hostname.endsWith(`.${APEX_DOMAIN}`);
  return onApex
    ? { name: AUTH_COOKIE_NAME, domain: `.${APEX_DOMAIN}` }
    : { name: AUTH_COOKIE_NAME };
}

/** Browser variant — resolves the host from `window` (SSR-safe). */
export function browserAuthCookieOptions(): CookieOptionsWithName {
  return authCookieOptions(
    typeof window !== "undefined" ? window.location.hostname : null,
  );
}
