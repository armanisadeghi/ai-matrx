import {
  HTML_CONTENT_TYPE,
  PAGE_CONTENT_TYPE_OR_FILTER,
  isMachineResourceUrl,
  isPageContentType,
  isResourceContentType,
} from "./page-content-class";

const WP_JSON = "https://datadestruction.com/wp-json/wp/v2/compliance/21086";
const WP_OEMBED =
  "https://datadestruction.com/wp-json/oembed/1.0/embed" +
  "?url=https%3A%2F%2Fdatadestruction.com%2Fhard-drive-shredding%2F";

describe("page content classification", () => {
  it("treats a not-yet-crawled page-shaped URL as a page", () => {
    // Most of the registry carries NULL here (sitemap/GSC-declared, never
    // fetched). Classifying those as assets would hide most of the registry.
    expect(isResourceContentType(null, "https://x.com/pricing")).toBe(false);
    expect(isResourceContentType(undefined, "https://x.com/pricing")).toBe(
      false,
    );
    expect(isPageContentType(null, "https://x.com/pricing")).toBe(true);
    // No URL supplied at all → content type is the only signal.
    expect(isResourceContentType(null)).toBe(false);
  });

  it("treats html as a page", () => {
    expect(isResourceContentType(HTML_CONTENT_TYPE, "https://x.com/a")).toBe(
      false,
    );
    expect(isPageContentType("html", "https://x.com/a")).toBe(true);
  });

  it("treats every non-html content type as a resource", () => {
    for (const contentType of [
      "image",
      "json",
      "xml",
      "pdf",
      "txt",
      "md",
      "other",
    ]) {
      expect(isResourceContentType(contentType)).toBe(true);
      expect(isPageContentType(contentType)).toBe(false);
    }
  });
});

describe("url shape classification", () => {
  // These exact URLs filled datadestruction.com's "pages needing attention"
  // list with 717 JSON endpoints. Mirrored by matrx-scraper's
  // tests/test_page_class.py — change one, change both.
  it.each([
    WP_JSON,
    WP_OEMBED,
    `${WP_OEMBED}&format=xml`,
    "https://datadestruction.com/wp-json",
    "https://datadestruction.com/wp-content/uploads/2023/05/logo.png",
    "https://example.com/assets/app.min.js",
    "https://example.com/styles.css",
    "https://example.com/report.pdf",
    "https://example.com/sitemap.xml",
    "https://example.com/robots.txt",
    "https://example.com/blog/feed",
    "https://example.com/blog/feed/",
    "https://example.com/?rest_route=/wp/v2/posts",
    "https://example.com/xmlrpc.php",
    "https://example.com/.well-known/security.txt",
    "https://example.com/fonts/inter.woff2",
  ])("classifies %s as a machine resource", (url) => {
    expect(isMachineResourceUrl(url)).toBe(true);
  });

  it.each([
    "https://datadestruction.com/",
    "https://datadestruction.com/compliance/state-laws/arizona",
    // Extensionless is ambiguous by design — never guessed as a resource.
    "https://example.com/learn/how-to-dispose-of-hard-drives",
    // Page-ish extensions are pages, not assets.
    "https://example.com/index.html",
    "https://example.com/product.php",
    "https://example.com/page.aspx",
    // "feed" as a content word, not the feed endpoint.
    "https://example.com/feeding-your-dog",
    "https://example.com/news/feeds-and-formats",
    "https://example.com/v1.2/release-notes",
    "",
  ])("classifies %s as a page", (url) => {
    expect(isMachineResourceUrl(url)).toBe(false);
  });

  it("accepts either signal", () => {
    // Verdict catches what shape cannot: a `.php` URL that served JSON.
    expect(isResourceContentType("json", "https://example.com/api.php")).toBe(
      true,
    );
    // Shape catches what the verdict gets wrong: a machine endpoint answering
    // with an HTML error document is still not a page anyone visits.
    expect(isResourceContentType("html", WP_JSON)).toBe(true);
    // This is the exact pre-fix data shape: fetched, never stamped.
    expect(isResourceContentType(null, WP_JSON)).toBe(true);
    expect(isResourceContentType(null, WP_OEMBED)).toBe(true);
  });
});

describe("PostgREST filter", () => {
  it("keeps the content-type half in step with the predicate", () => {
    expect(PAGE_CONTENT_TYPE_OR_FILTER).toBe(
      "content_type_last.is.null,content_type_last.eq.html",
    );
  });
});
