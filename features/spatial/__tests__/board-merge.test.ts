// Two tabs on one board never lose an edit: the save merges per tile instead of refusing.
// Before this, a save against a board another tab had changed threw "conflict" and the edit was
// dropped (18 tiles instead of 20 after two tabs each added one).

import type { BoardDocument, BoardNode } from "../board/document";
import { mergeBoardDocuments } from "../board/merge";

const cam = { x: 0, y: 0, z: 1 };
const tile = (id: string, x = 0, y = 0): BoardNode => ({
  id,
  rect: { x, y, w: 100, h: 100 },
  title: id,
  source: { kind: "text", markdown: id },
});
const doc = (nodes: BoardNode[], extra: Partial<BoardDocument> = {}): BoardDocument => ({
  camera: cam,
  nodes,
  groups: [],
  edges: [],
  shapes: [],
  ...extra,
});

describe("mergeBoardDocuments", () => {
  const base = doc([tile("a"), tile("b")]);

  it("keeps a tile each tab added", () => {
    const theirs = doc([tile("a"), tile("b"), tile("theirs")]);
    const ours = doc([tile("a"), tile("b"), tile("ours")]);
    const { doc: merged, conflicts } = mergeBoardDocuments(base, theirs, ours);
    expect(merged.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "ours", "theirs"]);
    expect(conflicts).toBe(0);
  });

  it("applies the other tab's move and our resize of a different tile", () => {
    const theirs = doc([tile("a", 500, 500), tile("b")]);
    const ours = doc([tile("a"), { ...tile("b"), rect: { x: 0, y: 0, w: 300, h: 300 } }]);
    const { doc: merged, conflicts } = mergeBoardDocuments(base, theirs, ours);
    expect(merged.nodes.find((n) => n.id === "a")?.rect.x).toBe(500);
    expect(merged.nodes.find((n) => n.id === "b")?.rect.w).toBe(300);
    expect(conflicts).toBe(0);
  });

  it("applies the other tab's removal and ours", () => {
    const theirs = doc([tile("b")]);
    const ours = doc([tile("a")]);
    const { doc: merged } = mergeBoardDocuments(base, theirs, ours);
    expect(merged.nodes).toEqual([]);
  });

  it("a tile both tabs changed differently: ours wins and it is counted", () => {
    const theirs = doc([tile("a", 10, 10), tile("b")]);
    const ours = doc([tile("a", 99, 99), tile("b")]);
    const { doc: merged, conflicts } = mergeBoardDocuments(base, theirs, ours);
    expect(merged.nodes.find((n) => n.id === "a")?.rect.x).toBe(99);
    expect(conflicts).toBe(1);
  });

  it("the same change in both tabs is no conflict", () => {
    const moved = doc([tile("a", 10, 10), tile("b")]);
    expect(mergeBoardDocuments(base, moved, moved).conflicts).toBe(0);
  });

  it("an untouched tile is not undone by a stale tab that never saw the other tab's tile", () => {
    // Ours is built from a tab that lacks the other tab's "theirs" tile; we did not remove it.
    const { doc: merged } = mergeBoardDocuments(base, doc([tile("a"), tile("b"), tile("theirs")]), doc([tile("a"), tile("b")]));
    expect(merged.nodes.map((n) => n.id)).toContain("theirs");
  });

  it("drops an arrow whose tile was removed", () => {
    const withEdge = doc([tile("a"), tile("b")], { edges: [{ id: "e", from: "a", to: "b" }] });
    const { doc: merged } = mergeBoardDocuments(withEdge, doc([tile("a")], { edges: [{ id: "e", from: "a", to: "b" }] }), withEdge);
    expect(merged.edges).toEqual([]);
  });
});
