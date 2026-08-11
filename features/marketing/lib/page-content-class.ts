/**
 * ONE rule for "is this `web.page` row an HTML page, or a crawled resource?"
 *
 * `web.page` is the anchor registry: every source (sitemap, GSC, crawl, links,
 * manual) upserts rows here, so it deliberately contains non-HTML URLs. A
 * sitemap listing 99 non-HTML URLs and a PDF ranking in Search Console are real
 * registry facts and real SEO findings — they must stay recorded. What they must
 * NOT do is inflate page counts or appear where the user is picking "a page".
 *
 * A row is a resource when EITHER signal says so:
 *
 * 1. The crawler's own response verdict (`web.page.content_type_last`) is a
 *    non-HTML type. Authoritative when a fetch happened — but NULL for 8.7k of
 *    10.8k rows ("no source has fetched this URL yet"), so it is silent for most
 *    of the registry and cannot be the only signal.
 *
 * 2. URL shape — an asset extension or a known machine endpoint path. This set is
 *    deliberately narrow: only shapes that can never be a page a human visits.
 *    Extensionless URLs, `.php`, `.html` and `.aspx` are NOT matched, because
 *    plenty of extensionless URLs serve JSON and plenty of `.php` URLs serve
 *    HTML — that ambiguity is exactly what signal 1 is for.
 *
 * Signal 2 exists because omitting it cost a real customer their audit: every
 * WordPress page's `<head>` carries a `json+oembed` alternate link, so the
 * pre-2026-07-27 crawler minted 700+ `/wp-json/...` rows with no content type,
 * and datadestruction.com's "pages needing attention" list became 717 JSON
 * endpoints faulted for missing `og:title` and `<h1>`.
 *
 * 3. A LEARNED per-site rule — {@link matchesEndpointRule}. Signal 2 only knows
 *    the families we already thought of; the endpoint-family sweep discovers new
 *    ones on real data and proposes each as a one-click assist. See that
 *    function's doc and aidream `services/endpoint_family_sweep/FEATURE.md`.
 *
 * Mirrored server-side by `web.is_machine_resource_url` +
 * `web.matches_endpoint_rule` + `web.v_page_list.is_resource` (migrations
 * 0334/0335) and by `matrx_utils.web_page_class`. Change one, change all three.
 */

/** The single content type that counts as an HTML page. */
export const HTML_CONTENT_TYPE = "html";

/**
 * Recorded content types that are an admission of IGNORANCE, not a verdict of
 * "not HTML" — they must behave exactly like NULL.
 *
 * `other` is what the crawler stores when detection gives up, and its biggest
 * single producer is a real HTML page: the scraper returns OTHER when a
 * response's `Content-Type` says `text/html` but the body-marker regex misses.
 * Treating that as "definitely not HTML" hid 97 allgreenrecycling.com pages —
 * each with a real `<title>` and up to 52 headings — from their own site audit.
 * Unknown-by-failure and unknown-by-omission are the same thing.
 */
export const UNKNOWN_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "other",
  "unknown",
  "",
]);

/** Extensions that can never serve an HTML page. `.html`/`.php`/`.aspx` are pages. */
const RESOURCE_EXTENSIONS = new Set([
  // images
  "png", "jpg", "jpeg", "gif", "webp", "svg", "svgz", "ico", "bmp", "tif",
  "tiff", "avif", "heic",
  // video / audio
  "mp4", "webm", "mov", "avi", "mkv", "m4v", "mp3", "wav", "ogg", "oga", "ogv",
  "m4a", "flac", "aac",
  // documents / data
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "tsv", "rtf",
  "json", "xml", "rss", "atom", "txt", "md", "yaml", "yml", "sql",
  // archives
  "zip", "gz", "tgz", "bz2", "7z", "rar", "tar", "dmg", "exe", "apk",
  // code / fonts served as assets
  "css", "js", "mjs", "map", "woff", "woff2", "ttf", "otf", "eot",
]);

/** Machine endpoint paths, regardless of extension. */
const RESOURCE_PATH_PATTERNS: RegExp[] = [
  /^\/wp-json(\/|$)/,
  /^\/wp-admin(\/|$)/,
  /^\/wp-includes(\/|$)/,
  /^\/wp-content(\/|$)/,
  /^\/xmlrpc\.php$/,
  /(^|\/)feed\/?$/,
  /(^|\/)rss(\.xml)?\/?$/,
  /^\/cdn-cgi(\/|$)/,
  /^\/\.well-known(\/|$)/,
];

/** WordPress' extensionless REST form. */
const RESOURCE_QUERY_PATTERNS: RegExp[] = [/(^|&)rest_route=/];

/**
 * True when `url` belongs to a LEARNED per-site machine-endpoint family — a
 * `web.site_endpoint_rule` row.
 *
 * Signal 2 above only knows the endpoint families we already thought of.
 * Shopify (`/cart/<id>:1?com_cvv=…`), Next.js (`/_next/data/…`), Drupal
 * (`/jsonapi/…`), Ghost (`/ghost/api/…`), Remix (`?_data=…`) and every custom
 * API reproduce the same bug on a future customer site. The endpoint-family
 * sweep (aidream `services/endpoint_family_sweep/`) detects new families on
 * real registry data, has an agent judge each one in plain language, and
 * proposes it as a one-click assist; accepting it writes a rule row.
 *
 * This is the SAME rule shape as signal 2 — a path prefix, optionally narrowed
 * to URLs carrying a given query parameter — scoped to one site rather than
 * hardcoded. Mirrors `web.matches_endpoint_rule` (migration 0334) and
 * `matrx_utils.web_page_class.matches_endpoint_rule`, including the two
 * behaviours that are easy to get wrong: a prefix ending in `/` also matches
 * the bare directory (`/cart/` covers `/cart`), and prefix matching is a
 * literal compare so metacharacters in a stored prefix cannot widen the rule.
 */
export function matchesEndpointRule(
  url: string | null | undefined,
  pathPrefix: string | null | undefined,
  queryParam?: string | null,
): boolean {
  if (!url || !pathPrefix) return false;
  const withoutScheme = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*/, "");
  const [beforeHash] = withoutScheme.split("#");
  const [rawPath, ...queryParts] = beforeHash.split("?");
  const path = (rawPath || "/").toLowerCase();
  const prefix = pathPrefix.toLowerCase();

  if (!path.startsWith(prefix) && path !== prefix.replace(/\/+$/, "")) {
    return false;
  }
  if (queryParam === null || queryParam === undefined) return true;
  const query = queryParts.join("?").toLowerCase();
  const escaped = queryParam.toLowerCase().replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  return new RegExp(`(^|&)${escaped}=`).test(query);
}

/**
 * True when the URL's SHAPE alone proves it is not a page a human visits.
 * Anything ambiguous returns false and is left to the crawler's content type.
 */
export function isMachineResourceUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const withoutScheme = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*/, "");
  const [beforeHash] = withoutScheme.split("#");
  const [rawPath, ...queryParts] = beforeHash.split("?");
  const path = (rawPath || "/").toLowerCase();
  const query = queryParts.join("?").toLowerCase();

  const lastSegment = path.split("/").pop() ?? "";
  if (lastSegment.includes(".")) {
    const extension = lastSegment.split(".").pop() ?? "";
    if (RESOURCE_EXTENSIONS.has(extension)) return true;
  }
  if (RESOURCE_PATH_PATTERNS.some((pattern) => pattern.test(path))) return true;
  return RESOURCE_QUERY_PATTERNS.some((pattern) => pattern.test(query));
}

/**
 * True when this registry row is a machine resource, not an HTML page.
 *
 * Pass the URL whenever you have it — without it, the 8.7k rows the crawler has
 * never fetched all classify as pages.
 */
export function isResourceContentType(
  contentTypeLast: string | null | undefined,
  url?: string | null,
): boolean {
  const recorded = (contentTypeLast ?? "").trim().toLowerCase();
  if (
    recorded !== "" &&
    !UNKNOWN_CONTENT_TYPES.has(recorded) &&
    recorded !== HTML_CONTENT_TYPE
  ) {
    return true;
  }
  return isMachineResourceUrl(url);
}

/** Inverse of {@link isResourceContentType} — HTML pages plus not-yet-crawled URLs. */
export function isPageContentType(
  contentTypeLast: string | null | undefined,
  url?: string | null,
): boolean {
  return !isResourceContentType(contentTypeLast, url);
}

/**
 * PostgREST `.or(...)` argument for the CONTENT-TYPE half of the rule, for
 * direct `web.page` reads that cannot go through `v_page_list`.
 *
 * Usage: `applyPageOnlyFilters(query)` — do not use this constant alone, it
 * misses every never-fetched machine URL.
 */
export const PAGE_CONTENT_TYPE_OR_FILTER =
  `content_type_last.is.null,content_type_last.eq.${HTML_CONTENT_TYPE}` as const;

/**
 * SQL `ILIKE` patterns for the URL-shape half, in the form PostgREST can
 * express. Coarser than {@link isMachineResourceUrl} (no extension test — the
 * content-type filter carries most of that) but it removes the machine
 * endpoints that dominate the registry.
 */
export const MACHINE_URL_ILIKE_PATTERNS = [
  "%/wp-json%",
  "%/wp-admin/%",
  "%/wp-includes/%",
  "%/wp-content/%",
  "%rest_route=%",
  "%/feed",
  "%/feed/",
] as const;

/** Minimal shape of the PostgREST builder methods used below. */
type PageFilterable<T> = {
  or(filter: string): T;
  not(column: string, operator: string, value: string): T;
};

/**
 * Apply BOTH halves of the rule to a direct `web.page` read.
 *
 * Prefer `v_page_list.is_resource` when the query can use the view — that is the
 * server-side mirror and it applies the full rule.
 */
export function applyPageOnlyFilters<T extends PageFilterable<T>>(query: T): T {
  let next = query.or(PAGE_CONTENT_TYPE_OR_FILTER);
  for (const pattern of MACHINE_URL_ILIKE_PATTERNS) {
    next = next.not("url", "ilike", pattern);
  }
  return next;
}
