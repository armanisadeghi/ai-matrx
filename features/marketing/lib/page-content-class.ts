/**
 * ONE rule for "is this `web.page` row an HTML page, or a crawled resource?"
 *
 * `web.page` is the anchor registry: every source (sitemap, GSC, crawl, links,
 * manual) upserts rows here, so it deliberately contains non-HTML URLs. A
 * sitemap listing 99 non-HTML URLs and a PDF ranking in Search Console are real
 * registry facts and real SEO findings — they must stay recorded. What they must
 * NOT do is inflate page counts or appear where the user is picking "a page".
 *
 * The classifier is the crawler's own response verdict (`web.page.content_type_last`),
 * never a guess from the URL — plenty of extensionless URLs serve JSON and plenty
 * of `.php` URLs serve HTML.
 *
 * NULL is NOT a resource. It means "no source has fetched this URL yet" (8.5k rows
 * today, mostly sitemap/GSC-declared). Treating unknown as an asset would silently
 * hide most of the registry.
 *
 * Mirrored server-side by `web.v_page_list.is_resource` (migration
 * `web_page_list_resource_class.sql`) and by matrx-scraper's
 * `web_crawl/analysis.py` audit gate. Change one, change all three.
 */

/** The single content type that counts as an HTML page. */
export const HTML_CONTENT_TYPE = "html";

/**
 * True when the crawler positively identified this row as a non-HTML resource
 * (image / json / xml / pdf / txt / md / other).
 *
 * `null` → false: not-yet-crawled is not an asset.
 */
export function isResourceContentType(
  contentTypeLast: string | null | undefined,
): boolean {
  return (
    contentTypeLast !== null &&
    contentTypeLast !== undefined &&
    contentTypeLast !== HTML_CONTENT_TYPE
  );
}

/** Inverse of {@link isResourceContentType} — HTML pages plus not-yet-crawled URLs. */
export function isPageContentType(
  contentTypeLast: string | null | undefined,
): boolean {
  return !isResourceContentType(contentTypeLast);
}

/**
 * PostgREST `.or(...)` argument selecting the same set as {@link isPageContentType},
 * for direct `web.page` reads that cannot go through `v_page_list`.
 *
 * Usage: `query.or(PAGE_CONTENT_TYPE_OR_FILTER)`
 */
export const PAGE_CONTENT_TYPE_OR_FILTER =
  `content_type_last.is.null,content_type_last.eq.${HTML_CONTENT_TYPE}` as const;
