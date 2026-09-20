import type { ShellNavItem } from "../constants/nav-data";

function normalizeRoutePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function isOnRoute(
  pathname: string,
  href: string,
  exact?: boolean,
): boolean {
  if (!href.startsWith("/")) return false;
  const current = normalizeRoutePath(pathname);
  const target = normalizeRoutePath(href);
  if (exact) return current === target;
  return current === target || current.startsWith(`${target}/`);
}

/** The one most-specific child that owns the current route. */
export function findActiveNavChild(
  pathname: string,
  item: ShellNavItem,
): NonNullable<ShellNavItem["children"]>[number] | undefined {
  return (item.children ?? [])
    .filter((child) => {
      if (child.external) return false;
      if (isOnRoute(pathname, child.href, child.exact)) return true;
      if (!child.href.startsWith(item.href)) return false;
      const childSuffix = child.href.slice(item.href.length);
      return (item.ownedRoutePrefixes ?? []).some((prefix) =>
        isOnRoute(pathname, `${prefix}${childSuffix}`, child.exact),
      );
    })
    .sort(
      (a, b) =>
        normalizeRoutePath(b.href).length - normalizeRoutePath(a.href).length,
    )[0];
}

/**
 * True when this group owns the current route.
 *
 * Ownership is the group's own href, its declared `ownedRoutePrefixes`, or
 * the same first path segment as the group's href. A flyout child that
 * points into another module (a shortcut / launcher) must not light this
 * group — that other module is the single selected owner.
 */
export function isNavGroupActive(
  pathname: string,
  item: ShellNavItem,
): boolean {
  if (item.external || item.openInNewTab) return false;
  if (isOnRoute(pathname, item.href)) return true;
  if (
    (item.ownedRoutePrefixes ?? []).some((prefix) =>
      isOnRoute(pathname, prefix),
    )
  ) {
    return true;
  }

  // Dynamic leaves that are not individually listed still belong to their
  // module's parent namespace (for example /agents/:id/build).
  const itemFirstSegment = item.href.split("/").filter(Boolean)[0];
  const pathFirstSegment = normalizeRoutePath(pathname)
    .split("/")
    .filter(Boolean)[0];
  if (itemFirstSegment && pathFirstSegment === itemFirstSegment) {
    return true;
  }

  return false;
}

export function navGroupIdentity(item: ShellNavItem): string {
  return `${item.label}::${item.iconName}`;
}

function ownershipSpecificity(pathname: string, item: ShellNavItem): number {
  let best = 0;
  if (isOnRoute(pathname, item.href)) {
    best = Math.max(best, normalizeRoutePath(item.href).length);
  }
  for (const prefix of item.ownedRoutePrefixes ?? []) {
    if (isOnRoute(pathname, prefix)) {
      best = Math.max(best, normalizeRoutePath(prefix).length);
    }
  }
  if (best === 0) {
    const segment = item.href.split("/").filter(Boolean)[0];
    if (segment) best = segment.length;
  }
  // Real modules win ties against placeholder twins that share an href.
  if ((item.children?.length ?? 0) > 0) best += 0.5;
  return best;
}

/** The one most-specific group that owns the current route. */
export function findOwningNavItem(
  pathname: string,
  items: readonly ShellNavItem[],
): ShellNavItem | undefined {
  const owners = items.filter((item) => isNavGroupActive(pathname, item));
  if (owners.length <= 1) return owners[0];
  return [...owners].sort((a, b) => {
    const spec =
      ownershipSpecificity(pathname, b) - ownershipSpecificity(pathname, a);
    if (spec !== 0) return spec;
    return a.label.localeCompare(b.label);
  })[0];
}

/** True when this item is the single selected owner among `candidates`. */
export function isExclusiveNavGroupActive(
  pathname: string,
  item: ShellNavItem,
  candidates: readonly ShellNavItem[],
): boolean {
  const owner = findOwningNavItem(pathname, candidates);
  return owner != null && navGroupIdentity(owner) === navGroupIdentity(item);
}

/** @deprecated Use the presentation-neutral name. */
export const isMobileNavGroupActive = isNavGroupActive;
