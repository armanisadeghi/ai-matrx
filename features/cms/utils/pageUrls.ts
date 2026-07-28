/**
 * C4 — Preview/live URL builder (master plan §5).
 *
 * TS twin of my-matrx's public routing rules.
 *
 * **`client_pages.route` is the truth** (CMS migration 0028). It is a
 * trigger-computed, NOT NULL column holding the page's full public path —
 * leading slash, no trailing slash, ARBITRARY depth. Never write it; never put
 * it in a writable field map. Pass it to `clientPageUrl` and it is used
 * verbatim; the path builders below exist only for callers that do not have the
 * saved row yet (an unsaved editor buffer, a promote candidate).
 *
 * Resolution on my-matrx (`lib/render/clientSiteRenderer.js`):
 *   - Any depth of path is matched against `client_pages.route` directly.
 *   - The legacy 1-segment (`slug`) and 2-segment (`category`/`slug`) lookups
 *     are RETAINED as aliases, so pre-0028 URLs still resolve even when they are
 *     no longer the canonical route (e.g. `/general/about` → `/about`).
 *   - 0 segments redirects to the home page's own `route`.
 *   - `?preview=true` renders the `_draft` columns (publicly reachable, no auth).
 *   - Standalone `html_pages` rows: `/p/{uuid}` (`my-matrx/pages/p/[id].js`),
 *     never preview-able (no draft twin on that table).
 *
 * Uniqueness moved with it: `client_pages_client_id_slug_key` was DROPPED for
 * `client_pages_client_id_route_key UNIQUE (client_id, route)`. A leaf slug is
 * NO LONGER unique per site — `/locations/austin/pricing` and
 * `/locations/dallas/pricing` legitimately coexist.
 *
 * Drift guard: `url-rules.json` (canonical copy in aidream) is copied verbatim
 * to `features/cms/utils/__tests__/url-rules.json` and asserted by
 * `pageUrls.test.ts` — both the aidream Python suite and this one test the same
 * bytes, so either side drifting turns one suite red.
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

export interface ClientPageRouteParams {
  slug: string;
  /** `client_pages.category`. The column DEFAULT is `'general'`, which means "no category". */
  category?: string | null;
  /** The PARENT page's own `route`, when this page is nested (`parent_id` set). */
  parentRoute?: string | null;
}

/**
 * Derive a page's public route from its parts — the TS twin of the CMS
 * project's `public._client_page_route_of(slug, category, parent_route)` and of
 * aidream's `aidream/services/cms/urls.py::client_page_route`. All three must
 * agree exactly; change one, change all three (and the shared `url-rules.json`).
 *
 * Rules, in order:
 *   1. `parentRoute` set                → `{parentRoute}/{slug}` (arbitrary depth)
 *   2. category null/empty              → `/{slug}`
 *   3. category === 'general'           → `/{slug}`  (the column DEFAULT = "no category named")
 *   4. category equals slug (ci)        → `/{slug}`  (a category INDEX page IS the category)
 *   5. otherwise                        → `/{category}/{slug}`
 *
 * THE PARENT NORMALIZATION RULE (CMS migration 0029). A parent route is
 * TRIMMED, then ALL trailing `/` are stripped, and only then is `/{slug}`
 * appended. `'/a/'`, `'/a//'` and `'  /a  '` all yield `/a/x`; the site root
 * `'/'` yields `/x`, never `//x`. Emptiness is judged on the TRIMMED value, so
 * a whitespace-only parent falls through to the category rules. One rule
 * applied once — not a trim for the emptiness test and a raw value for the
 * concatenation. This file was the one of the three that omitted the
 * trailing-slash strip entirely (`/a/` → `/a//x`), and `url-rules.json` had
 * ZERO `parent_route` cases, so nothing caught it. Never remove those cases.
 *
 * Prefer the saved `client_pages.route` whenever you have the row — this
 * derivation exists for callers that do not (unsaved buffers, promote candidates).
 */
export function clientPageRoute({ slug, category, parentRoute }: ClientPageRouteParams): string {
  const parent = (parentRoute ?? "").trim();
  if (parent) return `${parent.replace(/\/+$/, "")}/${slug}`;
  const cat = (category ?? "").trim();
  if (!cat) return `/${slug}`;
  if (cat.toLowerCase() === "general") return `/${slug}`;
  if (cat.toLowerCase() === slug.toLowerCase()) return `/${slug}`;
  return `/${cat}/${slug}`;
}

export interface ClientPageUrlParams {
  siteSlug: string;
  slug: string;
  /**
   * `client_pages.route` — trigger-computed, the authority. When present it is
   * used verbatim and `category`/`parentRoute` are ignored.
   */
  route?: string | null;
  /** Used only when `route` is absent. See `clientPageRoute`. */
  category?: string | null;
  /** Used only when `route` is absent. The parent page's own `route`. */
  parentRoute?: string | null;
  preview?: boolean;
  /** `client_sites.domain` (normalized). Set → live URL is domain-rooted. */
  domain?: string | null;
}

export function clientPageUrl({
  siteSlug,
  slug,
  route,
  category,
  parentRoute,
  preview,
  domain,
}: ClientPageUrlParams): string {
  const path = route?.trim() || clientPageRoute({ slug, category, parentRoute });
  // Preview always resolves on the platform /c/ host, never the custom domain.
  if (preview) {
    return `${HTML_SITE_URL}/c/${siteSlug}${path}?preview=true`;
  }
  if (domain) {
    return `https://${domain}${path}`;
  }
  return `${HTML_SITE_URL}/c/${siteSlug}${path}`;
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
