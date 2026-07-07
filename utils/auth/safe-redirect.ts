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

/**
 * Validates an `x-forwarded-host` header value against a host allowlist and
 * returns the host if trusted, otherwise `null` (caller falls back to the
 * request's own origin). This is the durable fix for KNOWN_DEFECTS.md D22's
 * residual: never build a redirect base URL from a spoofable header without
 * checking it. On Vercel the edge overwrites the header (infra-mitigated),
 * but self-hosted / misconfigured proxies would happily forward an
 * attacker-supplied value — turning the auth callback into an open redirect
 * that survives `safeRelativePath` (the PATH is safe; the HOST is not).
 *
 * Allowed hosts (all derived from env vars that already exist — no new
 * required configuration):
 *   - the host of `NEXT_PUBLIC_SITE_URL` (the canonical prod/site host)
 *   - Vercel's own system-env hosts (`VERCEL_URL`, `VERCEL_BRANCH_URL`,
 *     `VERCEL_PROJECT_PRODUCTION_URL` — bare hostnames, set automatically)
 *   - any `*.vercel.app` host, so preview-branch OAuth keeps working
 *     (this is why a blind exact-match allowlist was deferred in D22)
 *
 * Edge cases handled:
 *   - `x-forwarded-host` may be a comma-separated chain ("client, proxy1") —
 *     only the FIRST entry is considered, matching how the redirect would
 *     resolve.
 *   - a `:port` suffix is allowed for matching but preserved in the return
 *     value (the caller prefixes `https://`).
 *   - anything containing a slash, backslash, `@`, or whitespace is rejected
 *     outright — those can smuggle a path/userinfo into the base URL.
 *
 * Loud recovery (house rule): a rejection means either a spoof attempt or a
 * missing allowlist entry — both must be visible, so this screams via
 * `console.error` before returning `null`.
 */
export function safeForwardedHost(
  value: string | undefined | null,
): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;

  // Multiple proxies append: "original-host, proxy1-host". Trust decision is
  // about the first (client-facing) host.
  const host = value.split(",")[0].trim().toLowerCase();

  // Structural sanity: a hostname (optionally with :port). Reject anything
  // that could inject a path, userinfo, or second authority into
  // `https://${host}${path}`.
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) {
    console.error(
      `[safe-redirect] REJECTED malformed x-forwarded-host ${JSON.stringify(value)} — ` +
        "falling back to the request origin. If this recurs, someone is probing the auth callback.",
    );
    return null;
  }

  const bareHost = host.replace(/:\d{1,5}$/, "");

  const allowed = new Set<string>();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      allowed.add(new URL(siteUrl).hostname.toLowerCase());
    } catch {
      // Malformed env var — ignore; the Vercel checks below still apply.
    }
  }
  // Vercel system env vars are bare hostnames (no scheme).
  for (const envHost of [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]) {
    if (envHost) allowed.add(envHost.toLowerCase());
  }

  if (allowed.has(bareHost) || bareHost.endsWith(".vercel.app")) {
    return host;
  }

  console.error(
    `[safe-redirect] REJECTED x-forwarded-host ${JSON.stringify(host)} — not in the host ` +
      `allowlist (${[...allowed].join(", ") || "empty"} + *.vercel.app). Falling back to the ` +
      "request origin. Either this is a spoofed header (attack) or a legitimate new domain " +
      "that needs NEXT_PUBLIC_SITE_URL updated. See KNOWN_DEFECTS.md D22.",
  );
  return null;
}
