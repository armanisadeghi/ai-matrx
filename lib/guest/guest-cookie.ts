// lib/guest/guest-cookie.ts — THE GUEST SESSION'S OWN COOKIE (G2 guest data, 2026-10-09).
//
// A signed-out visitor who saves in a published Applet holds a GUEST session (a real, not-yet-permanent
// account; aidream `POST /auth/guest/session`). It lives in its OWN cookie, never the main auth cookie, so
// the proxy, AppShell and every `selectIsAuthenticated` reader keep seeing a signed-out visitor (G1 attack
// I1). Exactly three readers: the Applet host's guest client (`guest-supabase-client.ts`), the guest AI
// transport (it rides the visitor id, which aidream binds to this same guest), and the one session-handover
// helper (`session-handover.ts`). Host-only (no Domain): it never crosses to another subdomain.
export const GUEST_AUTH_COOKIE = "sb-matrx-guest";

/** The cookie and its @supabase/ssr chunks (`<name>.0`, `<name>.1`, …). */
export function isGuestAuthCookie(name: string): boolean {
  return name === GUEST_AUTH_COOKIE || name.startsWith(`${GUEST_AUTH_COOKIE}.`);
}
