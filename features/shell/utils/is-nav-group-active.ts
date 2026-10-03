import {
  expandNavChildren,
  type ShellNavChild,
  type ShellNavItem,
} from "../constants/nav-data";

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

/** Anything that holds a menu: a top-level item or a sub-area child. */
type NavMenuNode = Pick<ShellNavItem, "href" | "ownedRoutePrefixes"> & {
  children?: readonly ShellNavChild[];
};

function firstSegment(href: string): string | undefined {
  return normalizeRoutePath(href).split("/").filter(Boolean)[0];
}

/**
 * The route namespaces (first path segments) each sub-area of `node` holds,
 * keyed by the sub-area. A namespace that a sub-area holds is that sub-area's
 * own — never an alias of the node's href (Industries lists /legal as a route
 * it owns, not as another spelling of /education).
 */
function subAreaNamespaces(node: NavMenuNode): Map<ShellNavChild, Set<string>> {
  const out = new Map<ShellNavChild, Set<string>>();
  for (const child of node.children ?? []) {
    if ((child.children?.length ?? 0) === 0) continue;
    const segments = new Set<string>();
    for (const row of [child, ...expandNavChildren(child.children)]) {
      if (!row.href.startsWith("/")) continue;
      const segment = firstSegment(row.href);
      if (segment) segments.add(segment);
    }
    out.set(child, segments);
  }
  return out;
}

interface RouteMatch {
  /** Length of the route the child matched (its href, or its alias spelling). */
  length: number;
  /** True when the child's own href matched; false for an alias spelling. */
  direct: boolean;
}

/**
 * How `child` owns the current route, if it does. A child matches by its own
 * href, or — for a node with `ownedRoutePrefixes` aliases — by the same path
 * under an alias prefix. A prefix that is a sub-area's own namespace is never
 * treated as an alias.
 */
function childRouteMatch(
  pathname: string,
  node: NavMenuNode,
  child: ShellNavChild,
): RouteMatch | null {
  if (child.external || child.openInNewTab) return null;
  let best: RouteMatch | null = null;
  if (isOnRoute(pathname, child.href, child.exact)) {
    best = { length: normalizeRoutePath(child.href).length, direct: true };
  }
  if (!child.href.startsWith(node.href)) return best;
  const childSuffix = child.href.slice(node.href.length);
  const ownedNamespaces = new Set<string>();
  for (const segments of subAreaNamespaces(node).values()) {
    for (const segment of segments) ownedNamespaces.add(segment);
  }
  for (const prefix of node.ownedRoutePrefixes ?? []) {
    const segment = firstSegment(prefix);
    if (segment && ownedNamespaces.has(segment)) continue;
    const target = `${prefix}${childSuffix}`;
    if (!isOnRoute(pathname, target, child.exact)) continue;
    const length = normalizeRoutePath(target).length;
    if (!best || length > best.length) best = { length, direct: false };
  }
  return best;
}

function childMatchesRoute(
  pathname: string,
  node: NavMenuNode,
  child: ShellNavChild,
): boolean {
  return childRouteMatch(pathname, node, child) != null;
}

/**
 * The one most-specific LEAF that owns the current route, searched through
 * every level (a sub-area's own menu included). The longest matched route
 * wins; on a tie a child's own href beats an alias spelling.
 */
export function findActiveNavChild(
  pathname: string,
  item: NavMenuNode,
): ShellNavChild | undefined {
  let best: { child: ShellNavChild; match: RouteMatch } | undefined;
  for (const child of expandNavChildren(item.children, { leavesOnly: true })) {
    const match = childRouteMatch(pathname, item, child);
    if (!match) continue;
    if (
      !best ||
      match.length > best.match.length ||
      (match.length === best.match.length && match.direct && !best.match.direct)
    ) {
      best = { child, match };
    }
  }
  return best?.child;
}

/**
 * The DIRECT child of `item` on the way to the active route: the active leaf
 * itself, or the sub-area that contains it (so "Education" lights up in the
 * Industries flyout while a learner is on /education/flashcards). Falls back
 * to a sub-area whose own landing matches, then to the one sub-area whose
 * route namespace holds the path (/commerce/review → Commerce), for a route
 * with no listed row.
 */
export function findActiveNavBranch(
  pathname: string,
  item: NavMenuNode,
): ShellNavChild | undefined {
  const leaf = findActiveNavChild(pathname, item);
  const children = item.children ?? [];
  if (leaf) {
    const branch = children.find(
      (child) =>
        child === leaf ||
        expandNavChildren(child.children).includes(leaf),
    );
    if (branch) return branch;
  }
  const byLanding = children
    .filter(
      (child) =>
        (child.children?.length ?? 0) > 0 &&
        childMatchesRoute(pathname, item, child),
    )
    .sort(
      (a, b) =>
        normalizeRoutePath(b.href).length - normalizeRoutePath(a.href).length,
    )[0];
  if (byLanding) return byLanding;
  const segment = firstSegment(pathname);
  if (!segment) return undefined;
  const holders = [...subAreaNamespaces(item).entries()]
    .filter(([, segments]) => segments.has(segment))
    .map(([child]) => child);
  return holders.length === 1 ? holders[0] : undefined;
}

type NavChild = ShellNavChild;

/**
 * A child that is a real destination of this group (not a window-panel or
 * create action, which borrow a destination's href, and not an external app).
 */
function isOwnedDestination(child: NavChild): boolean {
  return (
    !child.external &&
    !child.openInNewTab &&
    child.panelAction == null &&
    child.action == null &&
    child.actionItem !== true &&
    child.href.startsWith("/")
  );
}

/** Length of the longest destination child that owns this route (0 = none). */
function childOwnershipLength(pathname: string, item: ShellNavItem): number {
  let best = 0;
  // Every level: a sub-area's own rows belong to the top-level group too.
  for (const child of expandNavChildren(item.children)) {
    if (!isOwnedDestination(child)) continue;
    if (isOnRoute(pathname, child.href, child.exact)) {
      best = Math.max(best, normalizeRoutePath(child.href).length);
    }
  }
  return best;
}

/**
 * True when this group owns the current route.
 *
 * Ownership is the group's own href, its declared `ownedRoutePrefixes`, one
 * of its destination children (a domain menu holds modules from several
 * route namespaces — Media owns /files, /images, /transcripts, /print), or
 * the same first path segment as the group's href. Every destination href
 * lives in exactly one domain (guarded by nav-no-loss.test.ts), so a child
 * never lights two groups; when namespaces overlap, the most specific match
 * wins in `findOwningNavItem`.
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

  if (childOwnershipLength(pathname, item) > 0) return true;

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
  best = Math.max(best, childOwnershipLength(pathname, item));
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
