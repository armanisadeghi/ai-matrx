import {
  collapseVisible,
  filterWithAncestors,
  groupedLayout,
  middleTruncate,
  radialLayout,
  tidyTreeLayout,
  type LayoutTreeItem,
  type PlanishRow,
} from "./layouts";

const leaf = (id: string): LayoutTreeItem => ({ node: { id }, children: [] });
const branch = (id: string, children: LayoutTreeItem[]): LayoutTreeItem => ({
  node: { id },
  children,
});

/** home → 2 pillars → clusters → articles. */
const tree: LayoutTreeItem[] = [
  branch("home", [
    branch("p1", [
      branch("c1", [leaf("a1"), leaf("a2"), leaf("a3")]),
      branch("c2", [leaf("a4")]),
    ]),
    branch("p2", [leaf("a5")]),
  ]),
];

const rows: PlanishRow[] = [
  { id: "home", parent_id: null },
  { id: "p1", parent_id: "home" },
  { id: "c1", parent_id: "p1" },
  { id: "a1", parent_id: "c1" },
  { id: "a2", parent_id: "c1" },
  { id: "p2", parent_id: "home" },
  { id: "a5", parent_id: "p2" },
];

describe("radialLayout", () => {
  it("centers a single root and places every node", () => {
    const positions = radialLayout(tree);
    expect(positions.get("home")).toEqual({ x: 0, y: 0 });
    expect(positions.size).toBe(10);
  });

  it("pushes crowded rings outward (adaptive radius)", () => {
    const wide = [
      branch(
        "root",
        Array.from({ length: 60 }, (_unused, index) => leaf(`n${index}`)),
      ),
    ];
    const positions = radialLayout(wide);
    const first = positions.get("n0");
    expect(first).toBeDefined();
    const radius = Math.hypot(first?.x ?? 0, first?.y ?? 0);
    // 60 siblings * 120px min arc / 2π ≈ 1146 — well beyond the base ring.
    expect(radius).toBeGreaterThan(1000);
  });

  it("is deterministic", () => {
    expect(radialLayout(tree)).toEqual(radialLayout(tree));
  });
});

describe("tidyTreeLayout", () => {
  it("gives each leaf its own row and centers parents on their children", () => {
    const positions = tidyTreeLayout(tree);
    const ys = ["a1", "a2", "a3", "a4", "a5"].map(
      (id) => positions.get(id)?.y ?? Number.NaN,
    );
    expect(new Set(ys).size).toBe(5); // no two leaves share a row
    const c1 = positions.get("c1");
    const a1 = positions.get("a1");
    const a3 = positions.get("a3");
    expect(c1?.y).toBeCloseTo(((a1?.y ?? 0) + (a3?.y ?? 0)) / 2);
  });

  it("increases x with depth", () => {
    const positions = tidyTreeLayout(tree);
    expect(positions.get("home")?.x).toBeLessThan(positions.get("p1")?.x ?? 0);
    expect(positions.get("p1")?.x).toBeLessThan(positions.get("c1")?.x ?? 0);
  });
});

describe("groupedLayout", () => {
  it("puts pillars in separate columns with the root above", () => {
    const positions = groupedLayout(tree);
    expect(positions.size).toBe(10);
    const p1 = positions.get("p1");
    const p2 = positions.get("p2");
    expect(p1?.y).toBe(p2?.y); // column heads share the header row
    expect((p2?.x ?? 0) - (p1?.x ?? 0)).toBeGreaterThan(400); // distinct columns
    expect(positions.get("home")?.y).toBeLessThan(p1?.y ?? 0);
  });

  it("wraps a large cluster subtree into a compact grid", () => {
    const big = [
      branch("home", [
        branch("p", [
          branch(
            "c",
            Array.from({ length: 9 }, (_unused, index) => leaf(`a${index}`)),
          ),
        ]),
      ]),
    ];
    const positions = groupedLayout(big);
    const xs = new Set(
      Array.from({ length: 9 }, (_unused, index) => positions.get(`a${index}`)?.x),
    );
    expect(xs.size).toBe(4); // 4-wide grid → 4 distinct x positions
  });
});

describe("filterWithAncestors", () => {
  it("keeps ancestors of matches and marks them dimmed", () => {
    const { rows: kept, dimmed } = filterWithAncestors(
      rows,
      (row) => row.id === "a1",
    );
    expect(kept.map((row) => row.id).sort()).toEqual(["a1", "c1", "home", "p1"]);
    expect(dimmed.has("home")).toBe(true);
    expect(dimmed.has("a1")).toBe(false);
  });

  it("returns everything undimmed when all rows match", () => {
    const { rows: kept, dimmed } = filterWithAncestors(rows, () => true);
    expect(kept).toHaveLength(rows.length);
    expect(dimmed.size).toBe(0);
  });
});

describe("collapseVisible", () => {
  it("hides descendants and counts them on the collapsed node", () => {
    const { rows: kept, hiddenCounts } = collapseVisible(rows, new Set(["p1"]));
    expect(kept.map((row) => row.id).sort()).toEqual(["a5", "home", "p1", "p2"]);
    expect(hiddenCounts.get("p1")).toBe(3); // c1, a1, a2
  });

  it("drops the badge for a collapsed node hidden inside an outer collapse", () => {
    const { rows: kept, hiddenCounts } = collapseVisible(
      rows,
      new Set(["p1", "c1"]),
    );
    expect(kept.some((row) => row.id === "c1")).toBe(false);
    expect(hiddenCounts.has("c1")).toBe(false);
    expect(hiddenCounts.get("p1")).toBe(3);
  });

  it("is a no-op with nothing collapsed", () => {
    const result = collapseVisible(rows, new Set());
    expect(result.rows).toBe(rows);
  });
});

describe("middleTruncate", () => {
  it("returns short strings untouched", () => {
    expect(middleTruncate("Copper Wire")).toBe("Copper Wire");
  });

  it("keeps head and tail around an ellipsis at the cap", () => {
    const long = "Copper Wire Recycling Services in Los Angeles County";
    const out = middleTruncate(long, 26);
    expect(out).toHaveLength(26);
    expect(out).toContain("…");
    expect(out.startsWith("Copper Wire")).toBe(true);
    expect(out.endsWith("County")).toBe(true);
  });
});
