/**
 * route-tree — pure aggregation that turns the canonical page registry into
 * the site's ROUTING TREE (the Structure workspace's data model).
 *
 * The tree is derived from URL paths exactly as they exist — whether the
 * routing "makes sense" or not is precisely what the view exposes. Rules:
 *
 * - A node is a unique URL path ("/", "/services", "/services/roofing", …).
 *   Multiple canonical pages can share a path (scheme/host/query variants);
 *   they all attach to the same node.
 * - A path prefix with no page of its own (e.g. `/blog/post-1` exists but
 *   `/blog` was never recorded) still gets a node — flagged `virtual` so the
 *   UI can show the gap honestly instead of silently inventing a page.
 * - Children sort by TOTAL subtree page count ascending (smallest sections
 *   first — the home page's small leaves before the 300-post blog), ties
 *   alphabetical by segment.
 * - Every node carries its per-relative-level page counts AND the running
 *   cumulative ("1 level down: 8 pages · within 2: 25 · total: 50").
 *
 * Fetch is bounded and paged in `data/service.ts` (`fetchSiteStructureRows`);
 * this module never touches Supabase. Consumed by
 * `components/structure/StructureWorkspace.tsx`.
 */

export interface StructurePageRow {
  pageId: string;
  /** Full canonical URL (scheme + host + path + query). */
  url: string;
  /** `web.page.path` — pathname only; null falls back to parsing `url`. */
  path: string | null;
  title: string | null;
  httpStatus: number | null;
  inSitemap: boolean;
}

export interface RouteTreeLevelCount {
  /** Relative depth below the node (1 = direct children's level). */
  level: number;
  /** Pages whose node sits exactly this many levels below. */
  pages: number;
  /** Pages within this many levels below, INCLUDING the node's own pages. */
  cumulativePages: number;
}

export interface RouteTreeNode {
  /** URL path of this node ("/" for the root). */
  path: string;
  /** Last path segment, URI-decoded for display ("" for the root). */
  segment: string;
  /** 0 = root, 1 = top-level section, … */
  depth: number;
  /** Canonical pages recorded exactly at this path (host/query variants included). */
  pages: StructurePageRow[];
  /** No page exists at this exact path — it only exists as a prefix of deeper URLs. */
  virtual: boolean;
  /** Sorted by subtreePages ascending, ties alphabetical by segment. */
  children: RouteTreeNode[];
  /** Direct children count (routes one level down, virtual included). */
  childCount: number;
  /** Route nodes anywhere below this node (excluding self). */
  descendantRoutes: number;
  /** Pages at this node plus everywhere below it. */
  subtreePages: number;
  /** Deepest relative level below this node (0 for a leaf). */
  subtreeDepth: number;
  /** Per-relative-level page counts with running cumulative; empty for a leaf. */
  levelCounts: RouteTreeLevelCount[];
}

export interface RouteTreeLevelBreakdown {
  /** Absolute depth (1 = directly under the home page). */
  depth: number;
  /** Route nodes at exactly this depth. */
  routes: number;
  /** Pages at exactly this depth. */
  pages: number;
  /** Pages at this depth or shallower (root included). */
  cumulativePages: number;
}

export interface SiteRouteTree {
  root: RouteTreeNode;
  totalPages: number;
  totalRoutes: number;
  /** Routes that exist only as prefixes — no recorded page. */
  virtualRoutes: number;
  maxDepth: number;
  /** Site-wide per-depth counts (depth 1..maxDepth; the root row is the tree header). */
  levelBreakdown: RouteTreeLevelBreakdown[];
}

interface MutableNode {
  path: string;
  segment: string;
  depth: number;
  pages: StructurePageRow[];
  children: Map<string, MutableNode>;
}

/** Pathname for a row: stored `path` first, else parsed from the URL. */
function rowPath(row: StructurePageRow): string {
  let path = row.path;
  if (!path) {
    try {
      path = new URL(row.url).pathname;
    } catch {
      path = "/";
    }
  }
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.replace(/\/+$/, "");
  return path || "/";
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function finalizeNode(node: MutableNode): RouteTreeNode {
  const children = [...node.children.values()].map(finalizeNode);
  children.sort(
    (a, b) =>
      a.subtreePages - b.subtreePages || a.segment.localeCompare(b.segment),
  );

  // Pages per relative level below this node, folded up from the children's
  // own level counts (child level k sits at k+1 relative to this node).
  const pagesAtLevel: number[] = [];
  for (const child of children) {
    pagesAtLevel[0] = (pagesAtLevel[0] ?? 0) + child.pages.length;
    child.levelCounts.forEach((count, index) => {
      pagesAtLevel[index + 1] = (pagesAtLevel[index + 1] ?? 0) + count.pages;
    });
  }
  let cumulative = node.pages.length;
  const levelCounts: RouteTreeLevelCount[] = pagesAtLevel.map(
    (pages, index) => {
      cumulative += pages ?? 0;
      return { level: index + 1, pages: pages ?? 0, cumulativePages: cumulative };
    },
  );

  return {
    path: node.path,
    segment: decodeSegment(node.segment),
    depth: node.depth,
    pages: node.pages,
    virtual: node.pages.length === 0,
    children,
    childCount: children.length,
    descendantRoutes: children.reduce(
      (sum, child) => sum + 1 + child.descendantRoutes,
      0,
    ),
    subtreePages:
      node.pages.length +
      children.reduce((sum, child) => sum + child.subtreePages, 0),
    subtreeDepth: children.length
      ? 1 + Math.max(...children.map((child) => child.subtreeDepth))
      : 0,
    levelCounts,
  };
}

/** Build the routing tree for one site from its canonical page rows. */
export function buildSiteRouteTree(
  rows: readonly StructurePageRow[],
): SiteRouteTree {
  const root: MutableNode = {
    path: "/",
    segment: "",
    depth: 0,
    pages: [],
    children: new Map(),
  };

  for (const row of rows) {
    const path = rowPath(row);
    if (path === "/") {
      root.pages.push(row);
      continue;
    }
    const segments = path.slice(1).split("/");
    let node = root;
    let current = "";
    for (const segment of segments) {
      current += `/${segment}`;
      let child = node.children.get(segment);
      if (!child) {
        child = {
          path: current,
          segment,
          depth: node.depth + 1,
          pages: [],
          children: new Map(),
        };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.pages.push(row);
  }

  const finalized = finalizeNode(root);

  const levelBreakdown: RouteTreeLevelBreakdown[] = [];
  const countAtDepth = (node: RouteTreeNode) => {
    if (node.depth > 0) {
      const entry = (levelBreakdown[node.depth - 1] ??= {
        depth: node.depth,
        routes: 0,
        pages: 0,
        cumulativePages: 0,
      });
      entry.routes += 1;
      entry.pages += node.pages.length;
    }
    node.children.forEach(countAtDepth);
  };
  countAtDepth(finalized);
  let cumulative = finalized.pages.length;
  for (const entry of levelBreakdown) {
    cumulative += entry.pages;
    entry.cumulativePages = cumulative;
  }

  let virtualRoutes = 0;
  const countVirtual = (node: RouteTreeNode) => {
    if (node.depth > 0 && node.virtual) virtualRoutes += 1;
    node.children.forEach(countVirtual);
  };
  countVirtual(finalized);

  return {
    root: finalized,
    totalPages: rows.length,
    totalRoutes: finalized.descendantRoutes,
    virtualRoutes,
    maxDepth: finalized.subtreeDepth,
    levelBreakdown,
  };
}

/**
 * Depth-limited flatten for the tree table: rows in render order honoring the
 * expand set ("*" = expanded). `maxDepth` caps how deep rows may render
 * regardless of expansion (the level filter); null = no cap.
 */
export function flattenRouteTree(
  root: RouteTreeNode,
  expanded: ReadonlySet<string>,
  maxDepth: number | null,
): RouteTreeNode[] {
  const rows: RouteTreeNode[] = [];
  const walk = (node: RouteTreeNode) => {
    rows.push(node);
    const open = expanded.has(node.path);
    if (!open) return;
    for (const child of node.children) {
      if (maxDepth !== null && child.depth > maxDepth) continue;
      walk(child);
    }
  };
  walk(root);
  return rows;
}

/**
 * Paths of every node matching a case-insensitive query (against path and
 * page titles), PLUS every ancestor path so the matches are reachable when
 * the returned set is used as the expand set.
 */
export function searchRouteTree(
  root: RouteTreeNode,
  query: string,
): { expand: Set<string>; matches: Set<string> } {
  const needle = query.trim().toLowerCase();
  const expand = new Set<string>();
  const matches = new Set<string>();
  if (!needle) return { expand, matches };
  const walk = (node: RouteTreeNode, ancestors: string[]): void => {
    const haystacks = [
      node.path.toLowerCase(),
      ...node.pages.map((page) => page.title?.toLowerCase() ?? ""),
    ];
    if (haystacks.some((value) => value.includes(needle))) {
      matches.add(node.path);
      for (const ancestor of ancestors) expand.add(ancestor);
    }
    const next = [...ancestors, node.path];
    for (const child of node.children) walk(child, next);
  };
  walk(root, []);
  return { expand, matches };
}
