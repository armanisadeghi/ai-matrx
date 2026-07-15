/**
 * C4 — Preview/live URL builder (master plan §5).
 *
 * TS twin of my-matrx's public routing rules. P1 owns the canonical, committed
 * `url-rules.json` fixture (a language-neutral drift guard P1 and this file are
 * both meant to test against) — it had not landed as of 2026-07-09, so this was
 * derived directly from the renderer source instead:
 * `my-matrx/pages/c/[client]/[[...slug]].js`.
 *   - Canonical page URL (line ~135): `/c/{siteSlug}/{category ? category + '/' : ''}{slug}`
 *     — a truthy `category` (the DB default is `'general'`, itself truthy) means a
 *     2-segment URL; only a falsy category (null/empty string) collapses to 1 segment.
 *   - `getServerSideProps` (line ~254): 0 segments redirects to the home page's own
 *     1-segment URL (`/c/{siteSlug}/{homeSlug}` — note: NOT category-prefixed, even
 *     when the home page has a category); 1 segment resolves by slug; 2 segments
 *     resolve by `(category, slug)`; >2 segments 404.
 *   - `?preview=true` renders the `_draft` columns (publicly reachable, no auth).
 *   - Standalone `html_pages` rows: `/p/{uuid}` (`my-matrx/pages/p/[id].js`), never
 *     preview-able (no draft twin on that table).
 *
 * The drift guard is now live: `url-rules.json` is copied to
 * `features/cms/utils/__tests__/url-rules.json` and asserted by
 * `pageUrls.test.ts` against every fixture case (both the aidream Python suite
 * and this one test the same file — either side drifting turns one suite red).
 *
 * W2-E (2026-07-14): a site with `client_sites.domain` set serves at that host
 * with NO `/c/{slug}` prefix. Pass `domain` to build domain-rooted live URLs;
 * preview URLs ALWAYS stay on the platform `/c/` form (they must work before
 * DNS is attached). See `my-matrx/docs/DOMAIN_ROUTING_DESIGN.md`.
 */

const HTML_SITE_URL = process.env.NEXT_PUBLIC_HTML_SITE_URL || "https://mymatrx.com";

export function htmlPageUrl(pageId: string): string {
  return `${HTML_SITE_URL}/p/${pageId}`;
}

export interface ClientPageUrlParams {
  siteSlug: string;
  slug: string;
  /** Falsy (null/undefined/empty string) collapses the URL to 1 segment. */
  category?: string | null;
  preview?: boolean;
  /** `client_sites.domain` (normalized). Set → live URL is domain-rooted. */
  domain?: string | null;
}

export function clientPageUrl({ siteSlug, slug, category, preview, domain }: ClientPageUrlParams): string {
  const seg = category ? `${category}/` : "";
  // Preview always resolves on the platform /c/ host, never the custom domain.
  if (preview) {
    return `${HTML_SITE_URL}/c/${siteSlug}/${seg}${slug}?preview=true`;
  }
  if (domain) {
    return `https://${domain}/${seg}${slug}`;
  }
  return `${HTML_SITE_URL}/c/${siteSlug}/${seg}${slug}`;
}

/**
 * The site root — resolves server-side to the home page's own URL via a
 * redirect. On a domain-mapped site the root is the domain itself.
 */
export function clientSiteRootUrl(siteSlug: string, preview?: boolean, domain?: string | null): string {
  if (preview) return `${HTML_SITE_URL}/c/${siteSlug}?preview=true`;
  return domain ? `https://${domain}` : `${HTML_SITE_URL}/c/${siteSlug}`;
}

/**
 * Normalize a user-typed custom domain to the canonical serving host stored in
 * `client_sites.domain`: lowercase, trim, strip scheme, path, port and a
 * trailing dot. The DB CHECK (`client_sites_domain_normalized`, CMS migration
 * 0014) rejects anything non-normalized, so this MUST run before save. Returns
 * `""` for an empty/whitespace input (→ clears the domain). IDN hosts must be
 * entered in punycode.
 */
export function normalizeDomainInput(raw: string): string {
  let host = (raw || "").trim().toLowerCase();
  if (!host) return "";
  host = host.replace(/^https?:\/\//, ""); // strip scheme
  host = host.split("/")[0]; // strip path
  host = host.split(":")[0]; // strip port
  if (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}
