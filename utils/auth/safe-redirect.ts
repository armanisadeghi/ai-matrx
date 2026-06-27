/**
 * utils/auth/safe-redirect.ts
 *
 * One canonical guard against open-redirect / phishing: only follow a redirect
 * target that is a same-site RELATIVE path. Every place that takes a redirect
 * destination from user input (a form field or a URL query param) and passes it
 * to `redirect()` / `NextResponse.redirect()` MUST route it through here.
 *
 * NOT for OAuth *provider* URLs — those are trusted absolute URLs returned by
 * Supabase (`signInWithOAuth().data.url`) and must redirect as-is. Only
 * user-supplied `redirectTo` / `callbackUrl` values pass through this guard.
 */

/**
 * Returns `value` only if it is a safe same-site relative path; otherwise `fallback`.
 *
 * A safe path starts with a single "/" and is not protocol-relative ("//host")
 * or a backslash variant ("/\\host" / "/%2F…" / "/%5C…", which browsers can
 * normalize to an off-site "//host"). This blocks absolute URLs
 * ("https://evil.com"), userinfo tricks ("@evil.com" — rejected because it does
 * not start with "/"), and protocol-relative URLs from reaching `redirect()`.
 */
export function safeRelativePath(
  value: string | undefined | null,
  fallback: string,
): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (!value.startsWith("/")) return fallback;
  // Reject the char right after the leading "/" being another "/" (protocol-
  // relative "//host"), a backslash ("/\host" — browsers normalize to "//"),
  // or whitespace/control ("/ /host", "/\thost") which can also resolve off-site.
  if (/^\/[/\\\s]/.test(value)) return fallback;
  // Reject percent-encoded "/" or "\" right after the leading slash
  // ("/%2F…", "/%5C…" in either case) — these decode to the vectors above.
  if (/^\/%(2f|5c)/i.test(value)) return fallback;
  return value;
}
