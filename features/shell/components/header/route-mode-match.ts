/**
 * Path matching shared by every RouteModeNav presentation.
 *
 * Segment boundaries are intentional: `/settings-old` is not a child of
 * `/settings`. Root/overview items can opt into exact matching so an
 * unregistered child route never silently identifies itself as Overview.
 */
export interface RouteModeMatchItem {
  href: string;
  exact?: boolean;
}

function normalizeRoutePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function routeModeItemMatches(
  item: RouteModeMatchItem,
  pathname: string,
): boolean {
  const href = normalizeRoutePath(item.href);
  const current = normalizeRoutePath(pathname);
  if (current === href) return true;
  return !item.exact && current.startsWith(`${href}/`);
}

/** Returns the most-specific matching route mode, or undefined when unregistered. */
export function resolveActiveRouteMode<T extends RouteModeMatchItem>(
  items: readonly T[],
  pathname: string,
): T | undefined {
  return items
    .filter((item) => routeModeItemMatches(item, pathname))
    .sort(
      (a, b) =>
        normalizeRoutePath(b.href).length - normalizeRoutePath(a.href).length,
    )[0];
}
