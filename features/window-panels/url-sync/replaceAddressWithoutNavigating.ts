/**
 * replaceAddressWithoutNavigating — the window layer's ONE way to change the
 * address bar.
 *
 * A window panel's address (`?panels=…`) is bookkeeping about floating windows,
 * never a new page. `router.replace` / `router.push` are App Router
 * NAVIGATIONS: they fetch a fresh RSC payload for the route and, on commit,
 * can remount the page that opened the panel — measured on /data-v2/[tableId]
 * (lane PANEL-REMOUNT, 2026-09-24): one `?_rsc=` request, then the whole grid
 * re-read and its row DOM replaced ~1 s after an agent button press.
 *
 * `history.replaceState` is patched by Next's app router: called with `null`
 * state it copies Next's own tree state onto the entry and dispatches a
 * `restore`, so `useSearchParams` / `usePathname` hold the new URL with no
 * server round trip and no remount.
 *
 * 🚨 Pass `null`, never `window.history.state`: Next's current entry carries
 * `__NA`, and a state object carrying `__NA` skips the patch — the address bar
 * would change while `useSearchParams` kept the old value.
 */
export function replaceAddressWithoutNavigating(href: string): void {
  if (typeof window === "undefined") return;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === href) return;
  window.history.replaceState(null, "", href);
}
