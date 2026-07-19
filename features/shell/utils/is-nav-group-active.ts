import type { ShellNavItem } from "../constants/nav-data";

export function isOnRoute(
  pathname: string,
  href: string,
  exact?: boolean,
): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** True when the current route belongs under this nav group (parent or any child). */
export function isMobileNavGroupActive(
  pathname: string,
  item: ShellNavItem,
): boolean {
  const children = item.children ?? [];

  if (isOnRoute(pathname, item.href)) return true;

  for (const child of children) {
    if (isOnRoute(pathname, child.href, child.exact)) return true;
  }

  // Dynamic segments under the group's namespace (e.g. /agents/:id/build).
  const itemFirstSegment = item.href.split("/").filter(Boolean)[0];
  const pathFirstSegment = pathname.split("/").filter(Boolean)[0];
  if (itemFirstSegment && pathFirstSegment === itemFirstSegment) {
    return true;
  }

  return false;
}
