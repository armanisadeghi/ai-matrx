/**
 * features/media-capture/runtime/live-capture-nav.ts
 *
 * Framework-free click classification for the live-capture navigation guard.
 *
 * Next.js App Router exposes no supported router blocker, so the only place to
 * intercept an in-app route change is the click that would start it — in the
 * capture phase, before `<Link>`'s own handler runs. This module answers the
 * one question that guard needs: "would this click navigate away from the
 * current route?" It is deliberately conservative — anything it is not certain
 * about is left alone, because wrongly swallowing a click is its own defect.
 */

/**
 * The in-app destination this click would navigate to, or null when the click
 * must be left alone.
 *
 * Left alone: modified clicks and non-left buttons (new tab / new window),
 * already-prevented events, `target` other than `_self`, downloads, non-anchor
 * clicks, cross-origin links, links to the SAME path (hash/query moves do not
 * unmount the route), and anything inside a `[data-live-capture-allow-nav]`
 * subtree — the opt-out for the recording surface's own links.
 */
export function interceptableHref(
  e: MouseEvent,
  currentLocation: { origin: string; pathname: string; href: string },
): string | null {
  if (e.defaultPrevented) return null;
  if (e.button !== 0) return null;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const target = e.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  if (anchor.closest("[data-live-capture-allow-nav]")) return null;

  let url: URL;
  try {
    url = new URL(anchor.getAttribute("href") ?? "", currentLocation.href);
  } catch {
    return null;
  }
  if (url.origin !== currentLocation.origin) return null;
  if (url.pathname === currentLocation.pathname) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
