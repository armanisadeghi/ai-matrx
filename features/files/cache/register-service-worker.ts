/**
 * features/files/cache/register-service-worker.ts
 *
 * Register the blob-cache Service Worker (`/blob-sw.js`) and push the
 * current backend URL + signed-in user id into it. The SW intercepts
 * cloud-files byte fetches (and registered CDN / share-link URLs) and
 * serves them from IndexedDB when present, falling through to the
 * network otherwise.
 *
 * Called from `app/DeferredSingletons.tsx` (a Client Component) on idle
 * after auth boot, so SSR is unaffected and registration doesn't block
 * the first paint.
 *
 * Dev-mode guards:
 *   - Disabled by default in development (`NODE_ENV !== 'production'`)
 *     to avoid HMR interference with Next's RSC cache.
 *   - Opt-in via `localStorage.matrx_dev_sw = '1'` for local testing.
 *
 * iOS Safari / private-browsing failure modes are tolerated silently —
 * if `navigator.serviceWorker` is undefined or `register()` rejects,
 * the app continues to function with just the in-memory LRU + IDB tiers
 * (no transparent `<img src>` interception).
 */

const SW_URL = "/blob-sw.js";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Register the SW and (when ready) send the initial `set-config` message
 * with the backend URL and signed-in user id. Returns the registration
 * (or null when SW isn't supported / registration failed).
 *
 * Idempotent — subsequent calls reuse the in-flight promise.
 */
export function registerBlobCacheServiceWorker(args: {
  backendUrl: string;
  userId: string | null;
  /** When true, force-register even in dev. */
  force?: boolean;
}): Promise<ServiceWorkerRegistration | null> {
  if (registrationPromise) {
    void postSetConfig(args).catch(() => undefined);
    return registrationPromise;
  }
  registrationPromise = (async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return null;
    }
    const isProd = process.env.NODE_ENV === "production";
    const devOptIn =
      typeof window !== "undefined" &&
      window.localStorage?.getItem("matrx_dev_sw") === "1";
    if (!isProd && !devOptIn && !args.force) {
      return null;
    }
    try {
      const reg = await navigator.serviceWorker.register(SW_URL, {
        scope: "/",
      });
      // Push config as soon as we have a controller — covers fresh
      // registrations (where the controller may not be set yet) by also
      // listening on `controllerchange`.
      void postSetConfig(args);
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        void postSetConfig(args);
      });
      return reg;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[blob-cache-sw] registration failed", err);
      return null;
    }
  })();
  return registrationPromise;
}

async function postSetConfig(args: {
  backendUrl: string;
  userId: string | null;
}): Promise<void> {
  const target =
    navigator.serviceWorker.controller ??
    (await navigator.serviceWorker.ready.then((r) => r.active));
  if (!target) return;
  target.postMessage({
    kind: "set-config",
    backendUrl: args.backendUrl.replace(/\/$/, ""),
    userId: args.userId,
  });
}

/**
 * Imperative invalidation. Drops every cached version of a fileId in the
 * SW's IDB tier. Called from invalidate() in features/files/hooks/blob-cache.ts.
 */
export async function postBlobCacheInvalidate(fileId: string): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  const ctrl = navigator.serviceWorker.controller;
  if (!ctrl) return;
  ctrl.postMessage({ kind: "invalidate", fileId });
}

/**
 * Per-user wipe. Called from sign-out.
 */
export async function postBlobCacheClearUser(userId: string): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  const ctrl = navigator.serviceWorker.controller;
  if (!ctrl) return;
  ctrl.postMessage({ kind: "clear-user", userId });
}

/**
 * Register a (canonical-URL → fileId+version+checksum) mapping so the SW
 * can recognise a public CDN URL or other byte URL the page has issued
 * and serve it from the same cache entry as the canonical
 * `/files/{id}/download` URL.
 */
export async function postBlobCacheRegisterUrlMapping(args: {
  url: string;
  fileId: string;
  version: number | null;
  checksum: string | null;
}): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  const ctrl = navigator.serviceWorker.controller;
  if (!ctrl) return;
  ctrl.postMessage({
    kind: "register-url-mapping",
    url: args.url,
    fileId: args.fileId,
    version: args.version,
    checksum: args.checksum,
  });
}
