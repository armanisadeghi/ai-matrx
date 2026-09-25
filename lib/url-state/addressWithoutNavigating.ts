/**
 * addressWithoutNavigating — THE one way to change the address bar without a
 * navigation (lane URL-STATE, 2026-09-24; born in lane PANEL-REMOUNT).
 *
 * Query state (`?view=`, `?panels=`, `?tab=`, a selected row, a filter) is
 * bookkeeping about the page you are on, never a new page. `router.replace` /
 * `router.push` are App Router NAVIGATIONS: each one fetches a fresh RSC
 * payload for the route (a `?_rsc=` request, a server round trip) and, on
 * commit, can remount the page — measured on /data-v2/[tableId]: one `?_rsc=`
 * request per layout switch, and before PANEL-REMOUNT the whole grid re-read.
 *
 * `history.pushState` / `history.replaceState` are patched by Next's app
 * router: called with a state object that does NOT carry `__NA`, the patch
 * copies Next's own tree state onto the new entry and dispatches a `restore`,
 * so `useSearchParams` / `usePathname` hold the new URL with no server round
 * trip and no remount. Back/forward still work (Next owns the entry).
 *
 * 🚨 This module always passes `null`. Passing `window.history.state` (the
 * old habit) forwards Next's `__NA` marker, which SKIPS the patch: the address
 * bar changes while `useSearchParams` keeps the old value.
 *
 * Use the router for a REAL route change (another page), or when the server
 * component of the current route reads the changed param from `searchParams`
 * — only a navigation re-renders server output. Everything else comes here.
 * Guard: eslint `matrx/no-navigation-for-query-state`.
 */

function currentHref(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** Resolve `href` (absolute, root-relative, or `?query`-relative) to path+search+hash. */
function resolve(href: string | URL): string {
  const url = new URL(String(href), window.location.href);
  if (url.origin !== window.location.origin) {
    throw new Error(
      `addressWithoutNavigating: ${url.origin} is another origin; history writes are same-origin only. Navigate instead.`,
    );
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Replace the current history entry's address. No navigation, no RSC fetch. */
export function replaceAddressWithoutNavigating(href: string | URL): void {
  if (typeof window === "undefined") return;
  const next = resolve(href);
  if (next === currentHref()) return;
  window.history.replaceState(null, "", next);
}

/** Push a new history entry (Back returns to the old address). No navigation, no RSC fetch. */
export function pushAddressWithoutNavigating(href: string | URL): void {
  if (typeof window === "undefined") return;
  const next = resolve(href);
  if (next === currentHref()) return;
  window.history.pushState(null, "", next);
}

/**
 * The current path (and hash) carrying `search` as its query — the usual
 * argument for the two writers above. An empty query drops the `?`.
 */
export function currentPathWithSearch(
  search: URLSearchParams | string,
): string {
  const qs = (typeof search === "string" ? search : search.toString()).replace(
    /^\?/,
    "",
  );
  if (typeof window === "undefined") return qs ? `?${qs}` : "";
  return `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
}

/** Just enough of Next's router for the two helpers below (and their tests). */
export interface AddressRouter {
  push: (href: string, options?: { scroll?: boolean }) => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
}

function isCurrentPath(href: string | URL): boolean {
  const url = new URL(String(href), window.location.href);
  return url.origin === window.location.origin && url.pathname === window.location.pathname;
}

/**
 * For a caller that names its page by a literal path (`/tasks?task=…`) but
 * can also render somewhere else (a window panel over another page): on that
 * page the change is query state, so no navigation; anywhere else it is a real
 * route change, so the router carries it exactly as before (`options` are the
 * router's, passed through unchanged).
 */
export function replaceAddressOrNavigate(
  router: AddressRouter,
  href: string,
  options?: { scroll?: boolean },
): void {
  if (typeof window !== "undefined" && isCurrentPath(href)) replaceAddressWithoutNavigating(href);
  else router.replace(href, options);
}

/** The push twin of {@link replaceAddressOrNavigate}. */
export function pushAddressOrNavigate(
  router: AddressRouter,
  href: string,
  options?: { scroll?: boolean },
): void {
  if (typeof window !== "undefined" && isCurrentPath(href)) pushAddressWithoutNavigating(href);
  else router.push(href, options);
}
