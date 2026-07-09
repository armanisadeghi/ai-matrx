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
 * When P1 publishes `url-rules.json`, copy it into this repo's test tree and add a
 * test asserting these functions against every fixture case (the drift guard C4
 * describes) — do not hand-derive further without re-checking against it.
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
}

export function clientPageUrl({ siteSlug, slug, category, preview }: ClientPageUrlParams): string {
  const path = category ? `${category}/${slug}` : slug;
  const url = `${HTML_SITE_URL}/c/${siteSlug}/${path}`;
  return preview ? `${url}?preview=true` : url;
}

/**
 * The site root — resolves server-side to the home page's own (1-segment,
 * non-category-prefixed) URL via a redirect. Prefer `clientPageUrl` directly
 * for a specific page's home entry when its slug is already known.
 */
export function clientSiteRootUrl(siteSlug: string, preview?: boolean): string {
  const url = `${HTML_SITE_URL}/c/${siteSlug}`;
  return preview ? `${url}?preview=true` : url;
}
