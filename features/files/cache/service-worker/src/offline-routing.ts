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
  if (method !== "GET" || requestOrigin !== swOrigin) return false;
  if (!pathname.startsWith("/_next/static/")) return false;
  // NOT everything under /_next/static/ is immutable, and the prefix alone is
  // the wrong test. In development Next serves unhashed names from this exact
  // tree (`/_next/static/chunks/app/layout.js`,
  // `/_next/static/development/_buildManifest.js`), and the worker IS
  // registerable in dev through the `matrx_dev_sw` opt-in — so a prefix rule
  // served stale JS forever after every edit.
  //
  // Cache-first is safe ONLY for a filename that carries a content hash,
  // because that is what guarantees a new build cannot reuse the name. So we
  // require one: at least 8 hash characters immediately before the extension.
  const filename = pathname.slice(pathname.lastIndexOf("/") + 1);
  return CONTENT_HASHED_FILENAME.test(filename);
}

/**
 * A content hash is ≥8 alphanumeric characters containing at least one digit,
 * sitting either at the start of the filename or after a `.`/`-` separator,
 * immediately before the extension.
 *
 * Matches: `main-app-1a2b3c4d5e.js`, `4bd1b696-9f7a2c3d4e5f6a7b.js`,
 *          `a1b2c3d4e5f6.css`, `logo.9f8e7d6c.svg`.
 * Rejects:  `layout.js`, `main-app.js`, `app.css`, `_buildManifest.js`
 *           (no digits / too short / not alphanumeric) — the dev filenames
 *           whose cache-first handling served stale JS after every edit.
 */
const CONTENT_HASHED_FILENAME =
  /(?:^|[.-])(?=[a-z0-9]*\d)[a-z0-9]{8,}\.[a-z0-9]+$/i;
