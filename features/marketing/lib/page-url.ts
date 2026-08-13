/**
 * features/marketing/lib/page-url.ts
 *
 * THE TypeScript twin of the platform's ONE URL/route identity rule set —
 * `matrx_scraper/utils/url.py` (`normalize_url` / `url_hash` / `page_route_key` /
 * `page_route_match_key`) plus its input-acceptance layer
 * `matrx_scraper/url_utils.py::normalize_url`.
 *
 * WHY THIS FILE IS PARANOID. `web.page` is unique on `(site_id, url_hash)` and
 * `url_hash` is `sha256(normalize_url(url))`. Every page a client mints, and
 * every comparison of a CMS route to a measured page, must produce byte-identical
 * output to the server or the arbiter stops deduplicating and a page silently
 * loses its entire measurement history. That is gap `G-CMS-IDENTITY`.
 *
 * Until 2026-08-10 this twin was written on `new URL()`, which silently disagreed
 * with Python's `urlparse` in three ways at once — it removes default ports
 * (`:80`/`:443`), percent-normalizes the path, and discards the `;params`
 * component. Each of those changes the digest. The parser below is a faithful
 * port of `urllib.parse.urlsplit`/`urlunparse` instead, and both repos test
 * against the SAME `url-identity-rules.json` fixture with a pinned SHA-256:
 *   aidream  packages/matrx-scraper/matrx_scraper/utils/url-identity-rules.json  (canonical)
 *   ai-matrx features/marketing/lib/__tests__/url-identity-rules.json            (verbatim copy)
 *
 * The server's deliberate quirks (default ports kept, no tracking-param
 * stripping, no percent-encoding normalization) are reproduced ON PURPOSE:
 * "fixing" any of them here would change 12.9M stored hashes. Change the server
 * rule + the fixture + this file together, or change nothing.
 */

/** Python's `urlsplit`/`urlparse` six-tuple, minus the pieces we never emit. */
interface ParsedUrl {
  scheme: string;
  netloc: string;
  path: string;
  params: string;
  query: string;
  fragment: string;
}

const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.\-]*$/;

/**
 * Faithful port of `urllib.parse.urlparse`. NOT `new URL()` — see the file
 * header for the three ways `new URL()` diverges.
 */
function urlparse(raw: string): ParsedUrl {
  let rest = raw;
  let scheme = "";
  let netloc = "";
  let query = "";
  let fragment = "";
  let params = "";

  const hash = rest.indexOf("#");
  if (hash >= 0) {
    fragment = rest.slice(hash + 1);
    rest = rest.slice(0, hash);
  }

  const colon = rest.indexOf(":");
  if (colon > 0 && SCHEME_PATTERN.test(rest.slice(0, colon))) {
    scheme = rest.slice(0, colon).toLowerCase();
    rest = rest.slice(colon + 1);
  }

  if (rest.startsWith("//")) {
    let delimiter = rest.length;
    for (const character of ["/", "?", "#"]) {
      const at = rest.indexOf(character, 2);
      if (at >= 0) delimiter = Math.min(delimiter, at);
    }
    netloc = rest.slice(2, delimiter);
    rest = rest.slice(delimiter);
  }

  const question = rest.indexOf("?");
  if (question >= 0) {
    query = rest.slice(question + 1);
    rest = rest.slice(0, question);
  }

  // `urlparse` splits `;params` off the LAST path segment only.
  const lastSlash = rest.lastIndexOf("/");
  const semicolon = rest.indexOf(";", lastSlash >= 0 ? lastSlash : 0);
  if (semicolon >= 0) {
    params = rest.slice(semicolon + 1);
    rest = rest.slice(0, semicolon);
  }

  return { scheme, netloc, path: rest, params, query, fragment };
}

/** Faithful port of `urllib.parse.urlunparse`. */
function urlunparse(parts: ParsedUrl): string {
  let url = parts.params ? `${parts.path};${parts.params}` : parts.path;
  if (parts.netloc || url.startsWith("//")) {
    if (url && !url.startsWith("/")) url = `/${url}`;
    url = `//${parts.netloc}${url}`;
  }
  if (parts.scheme) url = `${parts.scheme}:${url}`;
  if (parts.query) url = `${url}?${parts.query}`;
  if (parts.fragment) url = `${url}#${parts.fragment}`;
  return url;
}

/**
 * THE canonical stored identity of an observed HTTP(S) URL — the twin of
 * `matrx_scraper.utils.url.normalize_url`. Pure: it never throws and never
 * guesses at malformed input. For "the user typed something", go through
 * {@link normalisePageUrl}, which is the twin of the server's separate
 * input-acceptance layer.
 *
 *   - scheme + host lowercased; **path case preserved** (paths are case-sensitive)
 *   - fragment stripped; empty path becomes `/`; trailing `/` stripped except at root
 *   - params + query preserved verbatim, default ports kept, encoding untouched
 */
export function normalizeIdentityUrl(url: string): string {
  const parsed = urlparse(url.trim());
  const scheme = (parsed.scheme || "https").toLowerCase();
  const netloc = parsed.netloc.toLowerCase();
  let path = parsed.path || "/";
  if (path !== "/" && path.endsWith("/")) path = path.replace(/\/+$/, "");
  return urlunparse({
    scheme,
    netloc,
    path,
    params: parsed.params,
    query: parsed.query,
    fragment: "",
  });
}

/**
 * INPUT ACCEPTANCE — the twin of `matrx_scraper.url_utils.normalize_url`.
 * "Accept anything a human can plausibly type, or refuse loudly." This is NOT
 * the identity canonicalizer; it feeds one.
 */
export function acceptPageUrlInput(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) throw new Error("Enter a page URL.");
  // Case-INSENSITIVE scheme check on purpose: the server's `_normalise_url`
  // (crawler.py → utils/url.normalize_url) accepts `HTTPS://Example.COM` and
  // lowercases it via urlparse. Rejecting here what the server accepts breaks
  // parity for input a human plausibly types (D172). The identity layer
  // lowercases the scheme, so the raw casing is returned untouched.
  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith("http://") || lowered.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.includes("://")) {
    throw new Error("Only HTTP(S) page URLs can join the registry.");
  }
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

/**
 * Accept what the user typed, then return its canonical stored identity — the
 * exact two-step the server runs. Throws on empty input or a non-HTTP(S) scheme.
 */
export function normalisePageUrl(raw: string): string {
  const accepted = acceptPageUrlInput(raw);
  const normalized = normalizeIdentityUrl(accepted);
  if (!urlparse(normalized).netloc) {
    throw new Error("Enter a valid page URL, such as https://example.com/about.");
  }
  return normalized;
}

/** sha256 hex of the canonical identity — the server's `url_hash`. */
export async function pageUrlHash(normalizedUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizedUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Path component stored on `web.page.path` ("/" for the root). */
export function pagePathOf(normalizedUrl: string): string {
  return urlparse(normalizedUrl).path || "/";
}

/**
 * THE comparable ROUTE of a page — twin of `page_route_key`. One rule for every
 * place a `plan.node.route`, a `client_pages.route` and a `web.page.path` are
 * compared. Accepts a full URL or a bare path; returns the path only, leading
 * slash, no trailing slash, empty segments collapsed, **case preserved**.
 *
 * This replaced four different comparers (one of which lower-cased the path, so
 * a page at `/About` matched a plan route `/about` and then hashed to a
 * DIFFERENT `web.page` row). Do not add a fifth.
 */
export function pageRouteKey(urlOrPath: string | null | undefined): string {
  const raw = (urlOrPath ?? "").trim();
  if (!raw) return "/";
  const parked = raw.includes("://")
    ? raw
    : `https://route.invalid${raw.startsWith("/") ? raw : `/${raw}`}`;
  const path = urlparse(normalizeIdentityUrl(parked)).path || "/";
  const segments = path.split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}` : "/";
}

/**
 * Case-insensitive ALIAS key for a route — never the stored identity. Its only
 * sanctioned use is reconciling a route that failed an exact {@link pageRouteKey}
 * match, and only when it names exactly one candidate.
 */
export function pageRouteMatchKey(urlOrPath: string | null | undefined): string {
  return pageRouteKey(urlOrPath).toLowerCase();
}
