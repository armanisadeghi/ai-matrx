// features/hr/people/org-chart/__tests__/layout.test.ts
//
// The org chart's two load-bearing properties, proved rather than asserted.
//
// A unit test — not a browser check — because the interesting inputs are
// invisible to a test account under RLS: a real reporting cycle, an org whose
// whole top row is orphaned, a person who exists on one as-of date and not
// another. Those are exactly the shapes that hang a layout or drop a person,
// and none of them will be sitting in the seed data on the day somebody
// refactors this file.

import {
  NODE_WIDTH,
  ancestorsOf,
  layoutOrgChart,
  type OrgLayoutInput,
} from "../layout";

function node(
  id: string,
  managerId: string | null,
  sortKey = id,
): OrgLayoutInput {
  return { id, managerId, sortKey };
}

describe("layoutOrgChart — the cycle guard", () => {
  // 🚨 THE ONE THAT MATTERS. A→B→A is reachable through concurrent secondary
  // assignments, and a naive walk recurses until the tab dies. SPEC-EMPLOYEES
  // §2.2 route 11: "renders both nodes with a cycle badge … and never
  // infinite-loops the layout."
  it("terminates on a two-node cycle and still draws both people", () => {
    const layout = layoutOrgChart({
      nodes: [node("a", "b"), node("b", "a")],
    });

    expect(layout.nodes).toHaveLength(2);
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("terminates on a longer cycle", () => {
    const layout = layoutOrgChart({
      nodes: [node("a", "c"), node("b", "a"), node("c", "b")],
    });
    expect(layout.nodes).toHaveLength(3);
  });

  it("keeps a person whose manager is inside a cycle", () => {
    const layout = layoutOrgChart({
      nodes: [node("a", "b"), node("b", "a"), node("c", "a")],
    });
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("does not treat a self-managing row as a parent", () => {
    const layout = layoutOrgChart({ nodes: [node("a", "a")] });
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0].depth).toBe(0);
  });
});

describe("layoutOrgChart — nobody is silently dropped", () => {
  it("places every node it is given", () => {
    const nodes = [
      node("ceo", null),
      node("vp1", "ceo"),
      node("vp2", "ceo"),
      node("ic1", "vp1"),
      node("ic2", "vp1"),
      node("orphan", "someone-who-left"),
    ];
    const layout = layoutOrgChart({ nodes });
    expect(layout.nodes).toHaveLength(nodes.length);
  });

  it("treats a manager who is not in the node set as no manager", () => {
    // The manager was not employed on the as-of date. Their report is a root,
    // not a missing row.
    const layout = layoutOrgChart({ nodes: [node("ic", "gone")] });
    expect(layout.nodes[0].depth).toBe(0);
  });
});

describe("layoutOrgChart — stable across an as-of change", () => {
  // 🚨 §5.2: changing the date re-fetches and does NOT re-lay-out from scratch.
  // Because sibling order is a pure function of the PEOPLE, anyone under the
  // same manager on both dates keeps their slot with no remembered state.
  it("gives a persisting person the same position on both dates", () => {
    const january = layoutOrgChart({
      nodes: [
        node("ceo", null, "Ada"),
        node("a", "ceo", "Blake"),
        node("b", "ceo", "Casey"),
      ],
    });

    // June: a third report joined, and one of them is new.
    const june = layoutOrgChart({
      nodes: [
        node("ceo", null, "Ada"),
        node("a", "ceo", "Blake"),
        node("b", "ceo", "Casey"),
        node("c", "ceo", "Devon"),
      ],
    });

    const xOf = (layout: ReturnType<typeof layoutOrgChart>, id: string) =>
      layout.nodes.find((n) => n.id === id)?.x;

    // Blake and Casey are exactly where they were; only the parent recentres
    // over the wider row, which is the change made legible.
    expect(xOf(june, "a")).toBe(xOf(january, "a"));
    expect(xOf(june, "b")).toBe(xOf(january, "b"));
  });

  it("is order-independent — the input array's order changes nothing", () => {
    const forwards = layoutOrgChart({
      nodes: [node("ceo", null, "Ada"), node("a", "ceo", "Blake"), node("b", "ceo", "Casey")],
    });
    const backwards = layoutOrgChart({
      nodes: [node("b", "ceo", "Casey"), node("a", "ceo", "Blake"), node("ceo", null, "Ada")],
    });

    const positions = (layout: ReturnType<typeof layoutOrgChart>) =>
      Object.fromEntries(layout.nodes.map((n) => [n.id, n.x]));

    expect(positions(backwards)).toEqual(positions(forwards));
  });
});

describe("layoutOrgChart — collapse", () => {
  it("hides a collapsed subtree but keeps the parent's real child count", () => {
    const layout = layoutOrgChart({
      nodes: [node("ceo", null), node("a", "ceo"), node("b", "a")],
      collapsed: new Set(["a"]),
    });

    const a = layout.nodes.find((n) => n.id === "a");
    expect(a?.collapsed).toBe(true);
    expect(a?.childCount).toBe(1);
    // "b" is still PLACED — collapsing hides an edge, it does not delete a
    // person from the chart's own accounting.
    expect(layout.nodes.some((n) => n.id === "b")).toBe(true);
  });
});

describe("layoutOrgChart — geometry", () => {
  it("centres a parent over its children", () => {
    const layout = layoutOrgChart({
      nodes: [node("p", null, "A"), node("c1", "p", "B"), node("c2", "p", "C")],
    });
    const at = (id: string) => layout.nodes.find((n) => n.id === id)!;
    const centre = (id: string) => at(id).x + NODE_WIDTH / 2;

    expect(centre("p")).toBeCloseTo((centre("c1") + centre("c2")) / 2);
  });

  it("reports a width that contains every node", () => {
    const layout = layoutOrgChart({
      nodes: [node("p", null), node("c1", "p"), node("c2", "p")],
    });
    for (const placed of layout.nodes) {
      expect(placed.x + NODE_WIDTH).toBeLessThanOrEqual(layout.width);
    }
  });
});

describe("ancestorsOf", () => {
  it("walks up and stops", () => {
    const managerOf = new Map<string, string | null>([
      ["ic", "vp"],
      ["vp", "ceo"],
      ["ceo", null],
    ]);
    expect(ancestorsOf("ic", managerOf)).toEqual(["vp", "ceo"]);
  });

  it("terminates inside a cycle", () => {
    const managerOf = new Map<string, string | null>([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(ancestorsOf("a", managerOf)).toEqual(["b"]);
  });
});
