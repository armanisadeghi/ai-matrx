import {
  DEFAULT_ORG_CHART_LAYOUT,
  ancestorKeys,
  layoutOrgForest,
  roundedPath,
  type OrgChartTreeNode,
} from "../layout";

type N = OrgChartTreeNode<null>;
const node = (key: string, children: N[] = [], edgeKind: string | null = "automatic"): N => ({
  key,
  edgeKind,
  data: null,
  children,
});
const opts = (collapsed: string[] = [], over = {}) => ({
  ...DEFAULT_ORG_CHART_LAYOUT,
  collapsed: new Set(collapsed),
  ...over,
});

describe("layoutOrgForest", () => {
  it("centres a parent over its children, children one row below", () => {
    const tree = node("r", [node("a"), node("b")], null);
    const { nodes } = layoutOrgForest([tree], opts([], { stackThreshold: Infinity }));
    const byKey = Object.fromEntries(nodes.map((n) => [n.key, n]));
    const W = DEFAULT_ORG_CHART_LAYOUT.cardWidth;
    expect(byKey.r.x + W / 2).toBeCloseTo((byKey.a.x + byKey.b.x + W) / 2);
    expect(byKey.a.y).toBe(byKey.b.y);
    expect(byKey.a.y).toBeGreaterThan(byKey.r.y);
  });

  it("never overlaps sibling subtrees", () => {
    const tree = node("r", [node("a", [node("a1"), node("a2")]), node("b", [node("b1"), node("b2")])], null);
    const { nodes } = layoutOrgForest([tree], opts([], { stackThreshold: Infinity }));
    const row = nodes.filter((n) => n.depth === 2).sort((p, q) => p.x - q.x);
    for (let i = 1; i < row.length; i++) {
      expect(row[i].x - row[i - 1].x).toBeGreaterThanOrEqual(DEFAULT_ORG_CHART_LAYOUT.cardWidth);
    }
  });

  it("a collapsed node hides its team but reports its size", () => {
    const tree = node("r", [node("a", [node("a1", [node("a11")])])], null);
    const { nodes, edges } = layoutOrgForest([tree], opts(["a"]));
    expect(nodes.map((n) => n.key)).toEqual(["r", "a"]);
    const a = nodes.find((n) => n.key === "a")!;
    expect(a.collapsed).toBe(true);
    expect(a.descendantCount).toBe(2);
    expect(edges).toHaveLength(1);
  });

  it("stacks a large all-leaf team into two columns instead of one wide row", () => {
    const kids = Array.from({ length: 8 }, (_, i) => node(`k${i}`));
    const tree = node("r", kids, null);
    const stacked = layoutOrgForest([tree], opts());
    const flat = layoutOrgForest([tree], opts([], { stackThreshold: Infinity }));
    expect(stacked.width).toBeLessThan(flat.width / 2);
    expect(new Set(stacked.nodes.filter((n) => n.depth === 1).map((n) => n.x)).size).toBe(2);
  });

  it("carries each link's kind onto its edge", () => {
    const tree = node("r", [node("a", [], "automatic"), node("b", [], "manual")], null);
    const { edges } = layoutOrgForest([tree], opts());
    expect(Object.fromEntries(edges.map((e) => [e.toKey, e.kind]))).toEqual({ a: "automatic", b: "manual" });
  });
});

describe("helpers", () => {
  it("ancestorKeys returns the path to a node, root first", () => {
    const tree = node("r", [node("a", [node("x")])], null);
    expect(ancestorKeys([tree], "x")).toEqual(["r", "a"]);
    expect(ancestorKeys([tree], "missing")).toBeNull();
  });

  it("roundedPath rounds each corner", () => {
    expect(roundedPath([[0, 0], [0, 50], [50, 50]], 10)).toBe("M 0 0 L 0 40 Q 0 50 10 50 L 50 50");
  });
});
