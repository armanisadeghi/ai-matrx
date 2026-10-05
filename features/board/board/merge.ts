// features/board/board/merge.ts
//
// The three-way merge that keeps BOTH tabs' edits when two tabs change one board.
// Pure — no React, no network.
//
//   base   what this tab last knew the stored board to hold (its last save, or what it loaded)
//   theirs what the stored board holds now (another tab saved since)
//   ours   what this tab wants to save
//
// The unit is the TILE (a node, group, shape or arrow, by id), as in Figma / Miro / tldraw:
//   - this tab did not touch it  → the stored version stands (the other tab's move, resize,
//     add or remove is applied);
//   - only this tab touched it   → this tab's version goes on top (move, resize, add, remove);
//   - both touched it differently → this tab's version wins (last writer, per tile) and the
//     result says so in `conflicts`, so the person is told only when something was really
//     decided for them.
// The camera is never merged: it is each viewer's own view and is not stored with the board.

import type { BoardDocument, BoardEdge, BoardGroup, BoardNode } from "./document";
import type { BoardShape } from "./useBoard";

export interface MergeResult {
  doc: BoardDocument;
  /** Tiles both tabs changed differently (this tab's version was kept). */
  conflicts: number;
}

function canon(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canon(v)}`).join(",")}}`;
}

/** `parked: false` and no `parked` are the same tile. */
function normalizeNode<T>(item: T): unknown {
  const n = item as { parked?: boolean };
  return n && typeof n === "object" && "source" in n ? { ...n, parked: n.parked === true } : item;
}

/**
 * A node's kept basics (`BoardNode.basics`) are a sample of what the item holds, not an edit: a tab
 * that only refreshed them never overrides the other tab's move, and a difference in them alone is
 * never a conflict — the later sample is kept.
 */
type WithBasics = { basics?: { at: string } };
function withoutBasics<T>(item: T): T {
  if (!item || typeof item !== "object" || !("basics" in item)) return item;
  const { basics: _basics, ...rest } = item as T & WithBasics;
  return rest as T;
}
function laterBasics<T>(a: T | undefined, b: T | undefined): WithBasics["basics"] {
  const x = (a as WithBasics | undefined)?.basics;
  const y = (b as WithBasics | undefined)?.basics;
  if (!x) return y;
  if (!y) return x;
  return y.at > x.at ? y : x;
}
function withBasicsOf<T>(item: T, a: T | undefined, b: T | undefined): T {
  const basics = laterBasics(a, b);
  return basics ? ({ ...withoutBasics(item), basics } as T) : withoutBasics(item);
}

function mergeList<T extends { id: string }>(
  base: readonly T[],
  theirs: readonly T[],
  ours: readonly T[],
): { items: T[]; conflicts: number } {
  const byId = (list: readonly T[]) => new Map(list.map((x) => [x.id, x]));
  const b = byId(base);
  const t = byId(theirs);
  const o = byId(ours);
  const same = (x: T | undefined, y: T | undefined) =>
    x === y || (x !== undefined && y !== undefined && canon(normalizeNode(x)) === canon(normalizeNode(y)));

  let conflicts = 0;
  const pick = (id: string): T | undefined => {
    const bv = b.get(id);
    const tv = t.get(id);
    const ov = o.get(id);
    const oursChanged = !same(bv, ov);
    const theirsChanged = !same(bv, tv);
    if (!oursChanged) return tv;
    if (!theirsChanged) return ov;
    if (tv !== undefined && ov !== undefined) {
      const core = (x: T | undefined) => (x === undefined ? x : withoutBasics(x));
      // One side only refreshed basics: the other side's change stands, with the later basics.
      if (same(core(bv), core(ov))) return withBasicsOf(tv, tv, ov);
      if (same(core(bv), core(tv))) return withBasicsOf(ov, tv, ov);
      if (same(core(tv), core(ov))) return withBasicsOf(ov, tv, ov);
    }
    if (!same(tv, ov)) conflicts += 1;
    return ov;
  };

  // The stored order first (so the other tab's layout reads the same), then what only we added.
  const order = [...theirs.map((x) => x.id), ...ours.filter((x) => !t.has(x.id)).map((x) => x.id)];
  const items: T[] = [];
  for (const id of order) {
    const chosen = pick(id);
    if (chosen !== undefined) items.push(chosen);
  }
  return { items, conflicts };
}

export function mergeBoardDocuments(base: BoardDocument, theirs: BoardDocument, ours: BoardDocument): MergeResult {
  const nodes = mergeList<BoardNode>(base.nodes, theirs.nodes, ours.nodes);
  const groups = mergeList<BoardGroup>(base.groups, theirs.groups, ours.groups);
  const shapes = mergeList<BoardShape>(base.shapes, theirs.shapes, ours.shapes);
  const edges = mergeList<BoardEdge>(base.edges, theirs.edges, ours.edges);
  // An arrow whose end tile is gone (removed in either tab) goes with it.
  const ids = new Set([...nodes.items, ...groups.items, ...shapes.items].map((x) => x.id));
  return {
    doc: {
      camera: theirs.camera,
      nodes: nodes.items,
      groups: groups.items,
      shapes: shapes.items,
      edges: edges.items.filter((e) => ids.has(e.from) && ids.has(e.to)),
    },
    conflicts: nodes.conflicts + groups.conflicts + shapes.conflicts + edges.conflicts,
  };
}
