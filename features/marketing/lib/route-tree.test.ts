import {
  buildSiteRouteTree,
  flattenRouteTree,
  searchRouteTree,
  type StructurePageRow,
} from "./route-tree";

let id = 0;
function row(
  path: string,
  overrides?: Partial<StructurePageRow>,
): StructurePageRow {
  id += 1;
  return {
    pageId: `page-${id}`,
    url: `https://example.com${path === "/" ? "" : path}`,
    path,
    title: null,
    httpStatus: 200,
    inSitemap: false,
    ...overrides,
  };
}

const SITE: StructurePageRow[] = [
  row("/"),
  row("/about"),
  row("/contact"),
  row("/services"),
  row("/services/roofing"),
  row("/services/roofing/repair"),
  row("/services/plumbing"),
  row("/blog"),
  row("/blog/post-1"),
  row("/blog/post-2"),
  row("/blog/post-3"),
];

describe("buildSiteRouteTree", () => {
  it("attaches the homepage to the root and children to their path nodes", () => {
    const tree = buildSiteRouteTree(SITE);
    expect(tree.root.pages).toHaveLength(1);
    expect(tree.totalPages).toBe(11);
    expect(tree.root.childCount).toBe(4);
    expect(tree.maxDepth).toBe(3);
  });

  it("sorts children by subtree page count ascending, ties alphabetical", () => {
    const tree = buildSiteRouteTree(SITE);
    expect(tree.root.children.map((child) => child.segment)).toEqual([
      "about",
      "contact",
      "blog",
      "services",
    ]);
    // /blog subtree = 4 pages, /services subtree = 4 pages → alphabetical tie.
    const [, , third, fourth] = tree.root.children;
    expect(third.subtreePages).toBe(4);
    expect(fourth.subtreePages).toBe(4);
  });

  it("computes per-level and cumulative counts on every node", () => {
    const tree = buildSiteRouteTree(SITE);
    expect(tree.root.levelCounts).toEqual([
      { level: 1, pages: 4, cumulativePages: 5 },
      { level: 2, pages: 5, cumulativePages: 10 },
      { level: 3, pages: 1, cumulativePages: 11 },
    ]);
    const services = tree.root.children.find(
      (child) => child.segment === "services",
    )!;
    expect(services.levelCounts).toEqual([
      { level: 1, pages: 2, cumulativePages: 3 },
      { level: 2, pages: 1, cumulativePages: 4 },
    ]);
  });

  it("computes the site-wide level breakdown with running cumulative", () => {
    const tree = buildSiteRouteTree(SITE);
    expect(tree.levelBreakdown).toEqual([
      { depth: 1, routes: 4, pages: 4, cumulativePages: 5 },
      { depth: 2, routes: 5, pages: 5, cumulativePages: 10 },
      { depth: 3, routes: 1, pages: 1, cumulativePages: 11 },
    ]);
  });

  it("creates virtual nodes for path prefixes with no recorded page", () => {
    const tree = buildSiteRouteTree([row("/"), row("/docs/guides/intro")]);
    const docs = tree.root.children[0];
    expect(docs.segment).toBe("docs");
    expect(docs.virtual).toBe(true);
    expect(docs.children[0].virtual).toBe(true);
    expect(docs.children[0].children[0].virtual).toBe(false);
    expect(tree.virtualRoutes).toBe(2);
    expect(tree.totalRoutes).toBe(3);
  });

  it("groups host/query variants of one path onto one node", () => {
    const tree = buildSiteRouteTree([
      row("/pricing"),
      row("/pricing", { url: "https://example.com/pricing?utm=x" }),
    ]);
    expect(tree.root.children).toHaveLength(1);
    expect(tree.root.children[0].pages).toHaveLength(2);
  });

  it("falls back to parsing the URL when path is null and normalizes slashes", () => {
    const tree = buildSiteRouteTree([
      row("/team/", { path: null, url: "https://example.com/team/" }),
      row("/team", { path: null, url: "https://example.com/team" }),
    ]);
    expect(tree.root.children).toHaveLength(1);
    expect(tree.root.children[0].path).toBe("/team");
    expect(tree.root.children[0].pages).toHaveLength(2);
  });

  it("decodes segments for display but keys nodes on the raw segment", () => {
    const tree = buildSiteRouteTree([row("/caf%C3%A9")]);
    expect(tree.root.children[0].segment).toBe("café");
    expect(tree.root.children[0].path).toBe("/caf%C3%A9");
  });

  it("handles an empty site", () => {
    const tree = buildSiteRouteTree([]);
    expect(tree.totalPages).toBe(0);
    expect(tree.totalRoutes).toBe(0);
    expect(tree.maxDepth).toBe(0);
    expect(tree.levelBreakdown).toEqual([]);
  });
});

describe("flattenRouteTree", () => {
  it("honors the expand set and the depth cap", () => {
    const tree = buildSiteRouteTree(SITE);
    const collapsed = flattenRouteTree(tree.root, new Set(), null);
    expect(collapsed.map((node) => node.path)).toEqual(["/"]);

    const expanded = flattenRouteTree(
      tree.root,
      new Set(["/", "/services"]),
      null,
    );
    expect(expanded.map((node) => node.path)).toContain("/services/roofing");
    expect(expanded.map((node) => node.path)).not.toContain("/blog/post-1");

    const capped = flattenRouteTree(tree.root, new Set(["/", "/services"]), 1);
    expect(capped.map((node) => node.path)).not.toContain("/services/roofing");
  });
});

describe("searchRouteTree", () => {
  it("matches paths and titles and expands every ancestor", () => {
    const tree = buildSiteRouteTree([
      row("/"),
      row("/services/roofing/repair", { title: "Roof Repair Experts" }),
    ]);
    const byPath = searchRouteTree(tree.root, "roofing");
    expect(byPath.matches.has("/services/roofing")).toBe(true);
    expect(byPath.expand.has("/")).toBe(true);
    expect(byPath.expand.has("/services")).toBe(true);

    const byTitle = searchRouteTree(tree.root, "experts");
    expect(byTitle.matches.has("/services/roofing/repair")).toBe(true);
    expect(byTitle.expand.has("/services/roofing")).toBe(true);
  });
});
