/**
 * The pure Grafana-model layout engine (R7): compaction, placement,
 * free-slot search, mobile ordering, and THE TIER-0 GENERATOR
 * (autoLayoutSurface — summarize, never mirror the graph).
 */

import {
  applyPlacement,
  autoLayoutSurface,
  compactLayout,
  findFreeSlot,
  mobileOrderOf,
  type LayoutItem,
} from "../layout";
import {
  GRID_COLUMNS,
  SURFACE_SCHEMA_VERSION,
  validateSurfaceConfig,
  type Readout,
} from "../config";
import type { WorkflowDefinitionLike } from "../../trigger-points";

function item(id: string, x: number, y: number, w: number, h: number): LayoutItem {
  return { id, pos: { x, y, w, h } };
}

function posOf(items: LayoutItem[], id: string) {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`item "${id}" missing from layout`);
  return found.pos;
}

function noOverlaps(items: LayoutItem[]): boolean {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i].pos;
      const b = items[j].pos;
      const overlap =
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      if (overlap) return false;
    }
  }
  return true;
}

// ── compactLayout ───────────────────────────────────────────────────────────

describe("compactLayout", () => {
  it("removes vertical gaps and preserves relative order", () => {
    const input = [item("a", 0, 3, 24, 2), item("b", 0, 10, 24, 2)];
    const out = compactLayout(input);
    expect(posOf(out, "a")).toEqual({ x: 0, y: 0, w: 24, h: 2 });
    expect(posOf(out, "b")).toEqual({ x: 0, y: 2, w: 24, h: 2 });
    // Pure: input untouched.
    expect(input[0].pos.y).toBe(3);
    expect(input[1].pos.y).toBe(10);
  });

  it("pushes overlapping items DOWN, never sideways", () => {
    const out = compactLayout([item("a", 0, 0, 12, 4), item("b", 0, 0, 12, 4)]);
    // (y, x, id) order: "a" wins the slot; "b" keeps its x and moves down.
    expect(posOf(out, "a")).toEqual({ x: 0, y: 0, w: 12, h: 4 });
    expect(posOf(out, "b")).toEqual({ x: 0, y: 4, w: 12, h: 4 });
    expect(noOverlaps(out)).toBe(true);
  });

  it("floats items up only into genuinely free space (no jumping over blockers)", () => {
    const out = compactLayout([
      item("top", 0, 0, 24, 4),
      item("floater", 0, 9, 12, 2),
      item("side", 12, 9, 12, 2),
    ]);
    expect(posOf(out, "top").y).toBe(0);
    expect(posOf(out, "floater")).toEqual({ x: 0, y: 4, w: 12, h: 2 });
    expect(posOf(out, "side")).toEqual({ x: 12, y: 4, w: 12, h: 2 });
    expect(noOverlaps(out)).toBe(true);
  });

  it("is deterministic on ties via id order", () => {
    const a = compactLayout([item("z", 0, 0, 24, 2), item("a", 0, 0, 24, 2)]);
    const b = compactLayout([item("a", 0, 0, 24, 2), item("z", 0, 0, 24, 2)]);
    expect(posOf(a, "a").y).toBe(0);
    expect(posOf(a, "z").y).toBe(2);
    expect(posOf(b, "a").y).toBe(0);
    expect(posOf(b, "z").y).toBe(2);
  });
});

// ── applyPlacement ──────────────────────────────────────────────────────────

describe("applyPlacement", () => {
  it("lets the moved item win its chosen slot and shoves the occupant down", () => {
    const items = [item("a", 0, 0, 24, 4), item("b", 0, 4, 24, 4)];
    // Drag "b" on top of "a".
    const out = applyPlacement(items, item("b", 0, 0, 24, 4));
    expect(posOf(out, "b").y).toBe(0);
    expect(posOf(out, "a").y).toBe(4);
    expect(noOverlaps(out)).toBe(true);
  });

  it("cascades shoves downward through multiple items", () => {
    const items = [
      item("a", 0, 0, 24, 4),
      item("b", 0, 4, 24, 4),
      item("c", 0, 8, 24, 4),
    ];
    const out = applyPlacement(items, item("x", 0, 0, 24, 4));
    expect(posOf(out, "x").y).toBe(0);
    expect(posOf(out, "a").y).toBe(4);
    expect(posOf(out, "b").y).toBe(8);
    expect(posOf(out, "c").y).toBe(12);
    expect(noOverlaps(out)).toBe(true);
  });

  it("clamps x/w at the 24-column edge", () => {
    const out = applyPlacement([], item("wide", 20, 0, 10, 4));
    // w fits (10 <= 24) so x is pulled back to 24 - 10.
    expect(posOf(out, "wide")).toEqual({ x: 14, y: 0, w: 10, h: 4 });

    const oversize = applyPlacement([], item("huge", 5, 2, 99, 4));
    expect(posOf(oversize, "huge").w).toBe(GRID_COLUMNS);
    expect(posOf(oversize, "huge").x).toBe(0);
  });

  it("clamps negative coordinates and zero sizes", () => {
    const out = applyPlacement([], item("neg", -3, -2, 0, 0));
    expect(posOf(out, "neg")).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("does not shove items in other columns", () => {
    const items = [item("left", 0, 0, 12, 4), item("right", 12, 0, 12, 4)];
    const out = applyPlacement(items, item("left", 0, 0, 12, 6));
    expect(posOf(out, "left")).toEqual({ x: 0, y: 0, w: 12, h: 6 });
    // "right" does not overlap the resized "left" — it stays put.
    expect(posOf(out, "right")).toEqual({ x: 12, y: 0, w: 12, h: 4 });
  });
});

// ── findFreeSlot ────────────────────────────────────────────────────────────

describe("findFreeSlot", () => {
  it("returns the origin on an empty layout", () => {
    expect(findFreeSlot([], 12, 4)).toEqual({ x: 0, y: 0, w: 12, h: 4 });
  });

  it("fills left-to-right on the same row before moving down", () => {
    const items = [item("a", 0, 0, 12, 4)];
    expect(findFreeSlot(items, 12, 4)).toEqual({ x: 12, y: 0, w: 12, h: 4 });
  });

  it("moves to the next free row when the current rows are full", () => {
    const items = [item("rail", 0, 0, 24, 8)];
    expect(findFreeSlot(items, 12, 4)).toEqual({ x: 0, y: 8, w: 12, h: 4 });
  });

  it("finds a gap between items when the box fits", () => {
    const items = [item("a", 0, 0, 24, 2), item("b", 0, 6, 24, 2)];
    expect(findFreeSlot(items, 24, 4)).toEqual({ x: 0, y: 2, w: 24, h: 4 });
    // A taller box does not fit the gap → below everything.
    expect(findFreeSlot(items, 24, 5)).toEqual({ x: 0, y: 8, w: 24, h: 5 });
  });

  it("clamps an oversize request to the grid width", () => {
    expect(findFreeSlot([], 99, 4)).toEqual({ x: 0, y: 0, w: GRID_COLUMNS, h: 4 });
  });
});

// ── mobileOrderOf ───────────────────────────────────────────────────────────

describe("mobileOrderOf", () => {
  function readout(id: string, x: number, y: number): Readout {
    return { id, source: { kind: "node", nodeId: id }, pos: { x, y, w: 12, h: 4 } };
  }

  it("orders by (y, x)", () => {
    const order = mobileOrderOf([
      readout("c", 0, 8),
      readout("b", 12, 0),
      readout("a", 0, 0),
    ]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("breaks (y, x) ties stably by id", () => {
    const order = mobileOrderOf([readout("z", 0, 0), readout("a", 0, 0)]);
    expect(order).toEqual(["a", "z"]);
  });
});

// ── autoLayoutSurface ───────────────────────────────────────────────────────

function node(
  id: string,
  data?: { spec_type?: string; label?: string; output_kind?: string },
): WorkflowDefinitionLike["nodes"][number] {
  return { id, data };
}

function chainEdges(ids: string[]): WorkflowDefinitionLike["edges"] {
  return ids.slice(0, -1).map((source, i) => ({
    id: `e${i}`,
    source,
    target: ids[i + 1],
  }));
}

describe("autoLayoutSurface", () => {
  it("3-node linear workflow: rail (h=4) + every node promoted full-width, deliverable inferred", () => {
    const def: WorkflowDefinitionLike = {
      nodes: [node("n1"), node("n2"), node("n3")],
      edges: chainEdges(["n1", "n2", "n3"]),
    };
    const config = autoLayoutSurface(def);

    expect(config.schemaVersion).toBe(SURFACE_SCHEMA_VERSION);
    expect(config.pages).toEqual([]);
    expect(config.deliverableNodeId).toBe("n3"); // exactly one terminal

    const [rail, ...promoted] = config.readouts;
    expect(rail.id).toBe("auto:rail");
    expect(rail.source).toEqual({ kind: "progressRail" });
    expect(rail.pos).toEqual({ x: 0, y: 0, w: 24, h: 4 }); // small → h=4

    // Every node promoted, full width, stacked below the rail in graph order.
    expect(promoted.map((r) => r.id)).toEqual(["auto:n1", "auto:n2", "auto:n3"]);
    expect(promoted.map((r) => r.pos)).toEqual([
      { x: 0, y: 4, w: 24, h: 8 },
      { x: 0, y: 12, w: 24, h: 8 },
      { x: 0, y: 20, w: 24, h: 8 },
    ]);
    for (const r of promoted) expect(r.source.kind).toBe("node");

    expect(validateSurfaceConfig(config)).toEqual([]);
  });

  it("20-node graph: rail + bounded promotion (terminals, ai.*, subgraph.call as childRun), no deliverable with 2 terminals", () => {
    const chain = Array.from({ length: 18 }, (_, i) => `n${i + 1}`);
    const nodes = [
      ...chain.map((id) =>
        id === "n5" || id === "n6" || id === "n7"
          ? node(id, { spec_type: "ai.chat" })
          : id === "n10"
            ? node(id, { spec_type: "subgraph.call" })
            : node(id, { spec_type: "code.run" }),
      ),
      node("n19"),
      node("n20"),
    ];
    const edges = [
      ...chainEdges(chain),
      { id: "t1", source: "n18", target: "n19" },
      { id: "t2", source: "n18", target: "n20" },
    ];
    const config = autoLayoutSurface({ nodes, edges });

    // Two terminals → no inferred deliverable.
    expect(config.deliverableNodeId).toBeUndefined();

    const rail = config.readouts[0];
    expect(rail.id).toBe("auto:rail");
    expect(rail.pos).toEqual({ x: 0, y: 0, w: 24, h: 8 });

    const promoted = config.readouts.slice(1);
    expect(promoted.map((r) => r.id).sort()).toEqual(
      ["auto:n10", "auto:n19", "auto:n20", "auto:n5", "auto:n6", "auto:n7"].sort(),
    );

    // Graph-order tiling, 2 per row at w=12/h=8 (promoted > 3).
    expect(promoted.map((r) => r.id)).toEqual([
      "auto:n5",
      "auto:n6",
      "auto:n7",
      "auto:n10",
      "auto:n19",
      "auto:n20",
    ]);
    expect(promoted[0].pos).toEqual({ x: 0, y: 8, w: 12, h: 8 });
    expect(promoted[1].pos).toEqual({ x: 12, y: 8, w: 12, h: 8 });
    expect(promoted[2].pos).toEqual({ x: 0, y: 16, w: 12, h: 8 });

    // subgraph.call → childRun source; everything else → node source.
    const subgraph = promoted.find((r) => r.id === "auto:n10");
    expect(subgraph?.source).toEqual({ kind: "childRun", nodeId: "n10" });
    const ai = promoted.find((r) => r.id === "auto:n5");
    expect(ai?.source).toEqual({ kind: "node", nodeId: "n5" });

    expect(validateSurfaceConfig(config)).toEqual([]);
  });

  it("respects the deliverableNodeId option and options.promote", () => {
    const ids = Array.from({ length: 6 }, (_, i) => `n${i + 1}`);
    const def: WorkflowDefinitionLike = {
      nodes: ids.map((id) => node(id, { spec_type: "code.run" })),
      edges: chainEdges(ids),
    };
    const config = autoLayoutSurface(def, {
      deliverableNodeId: "n4",
      promote: ["n2", "not-a-node"],
    });
    expect(config.deliverableNodeId).toBe("n4");
    const ids2 = config.readouts.map((r) => r.id);
    expect(ids2).toContain("auto:n2"); // explicit promotion
    expect(ids2).toContain("auto:n4"); // deliverable
    expect(ids2).toContain("auto:n6"); // terminal
    expect(ids2).not.toContain("auto:not-a-node");
  });

  it("caps promotion at 12, preferring terminal + deliverable over output_kind order", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `n${i + 1}`);
    const def: WorkflowDefinitionLike = {
      nodes: ids.map((id) => node(id, { output_kind: "text" })),
      edges: chainEdges(ids), // n20 is the sole terminal (→ deliverable)
    };
    const config = autoLayoutSurface(def);

    const promoted = config.readouts.slice(1);
    expect(promoted).toHaveLength(12);
    expect(config.deliverableNodeId).toBe("n20");

    const promotedIds = promoted.map((r) => r.id);
    // Terminal/deliverable is protected by the cap; output_kind fills the
    // rest in graph order (n1..n11), so late middles fall off.
    expect(promotedIds).toContain("auto:n20");
    expect(promotedIds).toContain("auto:n1");
    expect(promotedIds).toContain("auto:n11");
    expect(promotedIds).not.toContain("auto:n12");
    expect(promotedIds).not.toContain("auto:n19");

    // Tiling is still graph order even though n20 outranked n12+.
    expect(promotedIds[promotedIds.length - 1]).toBe("auto:n20");
    expect(validateSurfaceConfig(config)).toEqual([]);
  });

  it("ignores an empty-string output_kind", () => {
    const def: WorkflowDefinitionLike = {
      nodes: [
        node("a", { output_kind: "" }),
        node("b", { output_kind: "seo.brief" }),
        node("c"),
        node("d"),
      ],
      edges: chainEdges(["a", "b", "c", "d"]),
    };
    const ids = autoLayoutSurface(def).readouts.map((r) => r.id);
    expect(ids).toContain("auto:b");
    expect(ids).not.toContain("auto:a");
  });

  it("emits stable auto: ids across regenerations", () => {
    const def: WorkflowDefinitionLike = {
      nodes: [node("alpha", { spec_type: "ai.chat" }), node("beta"), node("gamma")],
      edges: chainEdges(["alpha", "beta", "gamma"]),
    };
    const first = autoLayoutSurface(def);
    const second = autoLayoutSurface(def);
    expect(first.readouts.map((r) => r.id)).toEqual(second.readouts.map((r) => r.id));
    expect(first.readouts.map((r) => r.id)).toEqual([
      "auto:rail",
      "auto:alpha",
      "auto:beta",
      "auto:gamma",
    ]);
    expect(first).toEqual(second);
  });

  it("degrades gracefully on an empty definition: just the rail", () => {
    const config = autoLayoutSurface({ nodes: [], edges: [] });
    expect(config.readouts.map((r) => r.id)).toEqual(["auto:rail"]);
    expect(config.deliverableNodeId).toBeUndefined();
    expect(validateSurfaceConfig(config)).toEqual([]);
  });
});
