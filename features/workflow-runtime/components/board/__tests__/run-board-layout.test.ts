import {
  DELIVERABLE_TILE,
  MAX_ROWS,
  STEP_TILE,
  layoutWorkflowRunBoard,
  type RunBoardLayout,
  type RunBoardRect,
} from "../run-board-layout";

const tileOf = (layout: RunBoardLayout, id: string) => {
  const tile = layout.tiles.find((t) => t.nodeId === id);
  if (!tile) throw new Error(`no tile for ${id}`);
  return tile;
};

const overlaps = (a: RunBoardRect, b: RunBoardRect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const contains = (outer: RunBoardRect, inner: RunBoardRect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

// input → (research, outline) → draft → pack; `pack` is the deliverable.
const diamond = {
  nodes: [{ id: "pack" }, { id: "draft" }, { id: "outline" }, { id: "input" }, { id: "research" }],
  edges: [
    { source: "input", target: "research" },
    { source: "input", target: "outline" },
    { source: "research", target: "draft" },
    { source: "outline", target: "draft" },
    { source: "draft", target: "pack" },
    { source: "input", target: "pack" }, // a skip edge must not pull pack left
  ],
  deliverableIds: new Set(["pack"]),
};

describe("layoutWorkflowRunBoard", () => {
  it("layers by longest path, not by definition order", () => {
    const { layers } = layoutWorkflowRunBoard(diamond);
    // ties inside a layer fall back to definition order: outline (2) before research (4)
    expect(layers).toEqual([["input"], ["outline", "research"], ["draft"], ["pack"]]);
  });

  it("places one tile per node, deliverables larger, none overlapping, each inside its stage frame", () => {
    const layout = layoutWorkflowRunBoard(diamond);
    expect(layout.tiles.map((t) => t.nodeId).sort()).toEqual(
      ["draft", "input", "outline", "pack", "research"],
    );
    const pack = tileOf(layout, "pack");
    expect(pack.deliverable).toBe(true);
    expect([pack.rect.w, pack.rect.h]).toEqual([DELIVERABLE_TILE.w, DELIVERABLE_TILE.h]);
    const draft = tileOf(layout, "draft");
    expect([draft.rect.w, draft.rect.h]).toEqual([STEP_TILE.w, STEP_TILE.h]);
    for (const a of layout.tiles) {
      for (const b of layout.tiles) {
        if (a !== b) expect(overlaps(a.rect, b.rect)).toBe(false);
      }
      expect(contains(layout.frames[a.layer].rect, a.rect)).toBe(true);
    }
    // Stages flow left to right without touching.
    for (let i = 1; i < layout.frames.length; i++) {
      const prev = layout.frames[i - 1].rect;
      expect(layout.frames[i].rect.x).toBeGreaterThan(prev.x + prev.w);
    }
  });

  it("keeps every valid edge once and drops dangling, duplicate and self edges", () => {
    const layout = layoutWorkflowRunBoard({
      ...diamond,
      edges: [
        ...diamond.edges,
        { source: "draft", target: "pack" },
        { source: "draft", target: "draft" },
        { source: "ghost", target: "pack" },
      ],
    });
    expect(layout.edges).toHaveLength(diamond.edges.length);
  });

  it("is deterministic", () => {
    expect(layoutWorkflowRunBoard(diamond)).toEqual(layoutWorkflowRunBoard(diamond));
  });

  it("orders a layer by its parents' rows (barycenter)", () => {
    const layout = layoutWorkflowRunBoard({
      nodes: [{ id: "a" }, { id: "b" }, { id: "ya" }, { id: "xb" }],
      // definition order says ya before xb; parents say xb (child of a, row 0) first
      edges: [
        { source: "b", target: "ya" },
        { source: "a", target: "xb" },
      ],
    });
    expect(layout.layers[1]).toEqual(["xb", "ya"]);
  });

  it("wraps a wide fan-out into sub-columns inside one stage", () => {
    const fan = Array.from({ length: MAX_ROWS * 2 + 1 }, (_, i) => ({ id: `n${i}` }));
    const layout = layoutWorkflowRunBoard({
      nodes: [{ id: "root" }, ...fan],
      edges: fan.map((n) => ({ source: "root", target: n.id })),
    });
    const stage = layout.tiles.filter((t) => t.layer === 1);
    expect(new Set(stage.map((t) => t.rect.x)).size).toBe(3);
    expect(Math.max(...stage.map((t) => t.rect.y))).toBeLessThan(MAX_ROWS * (STEP_TILE.h + 40) + 48);
  });

  it("survives a cycle and a graph with no edges", () => {
    const cyc = layoutWorkflowRunBoard({
      nodes: [{ id: "s" }, { id: "a" }, { id: "b" }],
      edges: [
        { source: "s", target: "a" },
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ],
    });
    expect(cyc.tiles).toHaveLength(3);
    expect(cyc.layers[0]).toEqual(["s"]);
    const flat = layoutWorkflowRunBoard({ nodes: [{ id: "x" }, { id: "y" }], edges: [] });
    expect(flat.layers).toEqual([["x", "y"]]);
    expect(layoutWorkflowRunBoard({ nodes: [], edges: [] }).tiles).toEqual([]);
  });
});

describe("layoutWorkflowRunBoard — cycles", () => {
  it("places a node downstream of a cycle to the right of it, whatever the definition order", () => {
    const layout = layoutWorkflowRunBoard({
      // `after` is defined FIRST, but hangs off the loop b → a → b.
      nodes: [{ id: "after" }, { id: "s" }, { id: "a" }, { id: "b" }],
      edges: [
        { source: "s", target: "a" },
        { source: "a", target: "b" },
        { source: "b", target: "a" },
        { source: "b", target: "after" },
      ],
    });
    const layerOf = (id: string) => tileOf(layout, id).layer;
    expect(layerOf("s")).toBe(0);
    expect(layerOf("a")).toBe(1);
    expect(layerOf("b")).toBe(2);
    expect(layerOf("after")).toBe(3);
  });
});
