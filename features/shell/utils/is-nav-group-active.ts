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

/** True when the current route belongs under this nav group (parent or any child). */
export function isNavGroupActive(
  pathname: string,
  item: ShellNavItem,
): boolean {
  if (item.external || item.openInNewTab) return false;
  if (findActiveNavChild(pathname, item)) return true;
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

/** @deprecated Use the presentation-neutral name. */
export const isMobileNavGroupActive = isNavGroupActive;
