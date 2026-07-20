/**
 * Canonical page-URL normalization — the TypeScript twin of the scraper's
 * `_normalise_url` + `url_hash` (aidream `matrx_scraper/crawler.py` /
 * `web_crawl/persistence.py`). Manual page creation MUST hash identically to
 * the scraper's sitemap/GSC/crawl upserts or the `(site_id, url_hash)` unique
 * arbiter stops deduplicating. Change BOTH sides or neither.
 */

/** Lowercase scheme/host, drop fragment, strip trailing slash (except root). */
export function normalisePageUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter a page URL.");
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid page URL, such as https://example.com/about.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP(S) page URLs can join the registry.");
  }
  const scheme = parsed.protocol.replace(":", "").toLowerCase();
  const host = parsed.host.toLowerCase();
  let path = parsed.pathname || "/";
  if (path !== "/" && path.endsWith("/")) path = path.replace(/\/+$/, "");
  const query = parsed.search; // includes leading "?" or ""
  return `${scheme}://${host}${path}${query}`;
}

/** sha256 hex of the normalized URL — the scraper's `url_hash`. */
export async function pageUrlHash(normalizedUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizedUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Path component stored on `web.page.path` ("/" for the root). */
export function pagePathOf(normalizedUrl: string): string {
  return new URL(normalizedUrl).pathname || "/";
}
