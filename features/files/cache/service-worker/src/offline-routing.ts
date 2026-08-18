/**
 * The request-classification rules the service worker uses for offline study.
 *
 * These live outside `sw.ts` because they are the part that can BREAK THE APP
 * if they are wrong, and a service worker cannot be unit-tested directly. The
 * documented failure this guards against is real and already happened once
 * here: a worker that calls `respondWith()` too broadly and then falls through
 * to a failing fetch eats `next/dynamic` chunk loads, and overlay windows
 * silently never render.
 *
 * So the rules are deliberately narrow, and pinned by `offline-routing.test.ts`.
 */

/**
 * A same-origin top-level navigation into the education surface — the only
 * requests we serve an offline shell for. Sub-resource requests are excluded
 * (`mode === "navigate"` is the discriminator), so nothing that a page loads
 * can be answered with an HTML fallback.
 */
export function isStudyNavigationRequest(
  method: string,
  mode: string,
  requestOrigin: string,
  pathname: string,
  swOrigin: string,
): boolean {
  return (
    method === "GET" &&
    mode === "navigate" &&
    requestOrigin === swOrigin &&
    (pathname === "/education" || pathname.startsWith("/education/"))
  );
}

/**
 * Content-hashed build output. Cache-first is safe ONLY because these URLs are
 * immutable: a new build produces new filenames, so a cache hit can never be
 * stale. Never widen this to `/_next/` generally — that includes non-hashed
 * data and RSC payload routes where a stale hit is a real bug.
 */
export function isImmutableAssetRequest(
  method: string,
  requestOrigin: string,
  pathname: string,
  swOrigin: string,
): boolean {
  return (
    method === "GET" &&
    requestOrigin === swOrigin &&
    pathname.startsWith("/_next/static/")
  );
}
