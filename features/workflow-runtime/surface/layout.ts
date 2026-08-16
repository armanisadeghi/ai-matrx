/**
 * The PURE layout engine for the Run Surface — Grafana model (ruling R7).
 *
 * A 24-column grid with vertical compaction: items keep their x/w; overlap is
 * resolved by pushing DOWN (never sideways); everything floats UP into the
 * nearest free space, preserving relative vertical order. All functions are
 * deterministic (processing order is (y, x, id)) and pure — inputs are never
 * mutated, outputs are new objects.
 *
 * Also home to THE TIER-0 GENERATOR (`autoLayoutSurface`, PLAN §4.2-1):
 * a workflow definition in, the default RunSurfaceConfig out — SUMMARIZE,
 * NEVER MIRROR THE GRAPH.
 *
 * No React, no Redux, no side effects.
 */

import {
  GRID_COLUMNS,
  SURFACE_SCHEMA_VERSION,
  type GridPos,
  type Readout,
  type ReadoutSource,
  type RunSurfaceConfig,
} from "./config";
import type { WorkflowDefinitionLike } from "../trigger-points";

export interface LayoutItem {
  id: string;
  pos: GridPos;
}

// ── Geometry primitives ─────────────────────────────────────────────────────

function collides(a: GridPos, b: GridPos): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function collidesAny(placed: readonly LayoutItem[], pos: GridPos): boolean {
  return placed.some((p) => collides(p.pos, pos));
}

/** Deterministic processing order: (y, x, id). */
function byYXId(a: LayoutItem, b: LayoutItem): number {
  if (a.pos.y !== b.pos.y) return a.pos.y - b.pos.y;
  if (a.pos.x !== b.pos.x) return a.pos.x - b.pos.x;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function clonePos(pos: GridPos): GridPos {
  return { x: pos.x, y: pos.y, w: pos.w, h: pos.h };
}

/** Clamp a box onto the 24-column grid (w to 1..24, x to fit, y >= 0, h >= 1). */
function clampToGrid(pos: GridPos): GridPos {
  const w = Math.min(GRID_COLUMNS, Math.max(1, Math.round(pos.w)));
  const x = Math.min(GRID_COLUMNS - w, Math.max(0, Math.round(pos.x)));
  const y = Math.max(0, Math.round(pos.y));
  const h = Math.max(1, Math.round(pos.h));
  return { x, y, w, h };
}

/**
 * Core compaction pass. Items are processed in the given comparator's order;
 * each item first floats UP row-by-row into the nearest free space (it cannot
 * jump over a blocker), then is pushed DOWN past any remaining collision.
 * x/w never change.
 */
function compactWith(
  items: readonly LayoutItem[],
  cmp: (a: LayoutItem, b: LayoutItem) => number,
): LayoutItem[] {
  const sorted = items
    .map((item) => ({ id: item.id, pos: clonePos(item.pos) }))
    .sort(cmp);
  const placed: LayoutItem[] = [];
  for (const item of sorted) {
    let y = item.pos.y;
    // Float up while the row above is free (never jumps over a blocker).
    while (y > 0 && !collidesAny(placed, { ...item.pos, y: y - 1 })) y -= 1;
    // Resolve any remaining overlap by pushing DOWN — never sideways.
    while (collidesAny(placed, { ...item.pos, y })) y += 1;
    placed.push({ id: item.id, pos: { ...item.pos, y } });
  }
  return placed;
}

/**
 * Vertical compaction, Grafana-style: items keep their x/w; overlapping items
 * are pushed DOWN (never sideways); then everything floats UP into the
 * nearest free space, preserving relative vertical order. Deterministic:
 * process in (y, x, id) order. Pure — returns NEW items, input untouched.
 */
export function compactLayout(items: LayoutItem[]): LayoutItem[] {
  return compactWith(items, byYXId);
}

/**
 * Place a moved/resized item: clamp x/w to the 24-col grid, then resolve
 * collisions by pushing overlapped items down, then compact. The moved item
 * KEEPS the position the user chose (it wins ties).
 */
export function applyPlacement(items: LayoutItem[], moved: LayoutItem): LayoutItem[] {
  const movedItem: LayoutItem = { id: moved.id, pos: clampToGrid(moved.pos) };

  // Pin the moved item first, then push every colliding other DOWN, cascading
  // in (y, x, id) order so shoves propagate deterministically.
  const placed: LayoutItem[] = [movedItem];
  const others = items
    .filter((item) => item.id !== moved.id)
    .map((item) => ({ id: item.id, pos: clonePos(item.pos) }))
    .sort(byYXId);
  for (const other of others) {
    let y = other.pos.y;
    while (collidesAny(placed, { ...other.pos, y })) y += 1;
    placed.push({ id: other.id, pos: { ...other.pos, y } });
  }

  // Compact — the moved item wins ties at equal (y, x).
  const movedWinsTies = (a: LayoutItem, b: LayoutItem): number => {
    const base = byYXId(a, b);
    if (a.pos.y === b.pos.y && a.pos.x === b.pos.x) {
      if (a.id === moved.id) return -1;
      if (b.id === moved.id) return 1;
    }
    return base;
  };
  return compactWith(placed, movedWinsTies);
}

/** First free slot scanning left-to-right, top-to-bottom for a w×h box. */
export function findFreeSlot(items: LayoutItem[], w: number, h: number): GridPos {
  const boxW = Math.min(GRID_COLUMNS, Math.max(1, Math.round(w)));
  const boxH = Math.max(1, Math.round(h));
  // Everything fits at or above the bottom edge of the current layout.
  const bottom = items.reduce((max, item) => Math.max(max, item.pos.y + item.pos.h), 0);
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x <= GRID_COLUMNS - boxW; x += 1) {
      const candidate: GridPos = { x, y, w: boxW, h: boxH };
      if (!collidesAny(items, candidate)) return candidate;
    }
  }
  return { x: 0, y: bottom, w: boxW, h: boxH };
}

/** Single-column order for mobile: sort by (y, x), stable by id. */
export function mobileOrderOf(readouts: Readout[]): string[] {
  return readouts
    .map((r) => ({ id: r.id, pos: r.pos }))
    .sort(byYXId)
    .map((r) => r.id);
}

// ── THE TIER-0 GENERATOR (PLAN §4.2-1 — summarize, never mirror the graph) ──

export interface AutoLayoutOptions {
  /** Node ids that must get their own readout regardless of heuristics. */
  promote?: string[];
  /** deliverable node id when known (gets prominence). */
  deliverableNodeId?: string;
}

/** The lane budget: never more than this many promoted readouts. */
const PROMOTION_CAP = 12;

type DefinitionNode = WorkflowDefinitionLike["nodes"][number];

function specTypeOf(node: DefinitionNode): string {
  const specType = node.data?.spec_type;
  return typeof specType === "string" ? specType : "";
}

function hasOutputKind(node: DefinitionNode): boolean {
  const outputKind = node.data?.output_kind;
  return typeof outputKind === "string" && outputKind.length > 0;
}

function isAiOrChild(node: DefinitionNode): boolean {
  const specType = specTypeOf(node);
  return specType.startsWith("ai.") || specType === "subgraph.call";
}

/**
 * THE TIER-0 GENERATOR. From a workflow definition, produce the default
 * RunSurfaceConfig: one full-width progressRail on top (auto-layout is the
 * one sanctioned rail-at-top: nothing is above it), promoted readouts for
 * the nodes users actually watch (terminal / deliverable, authored
 * output_kind, ai.* and child workflows, plus explicit promotions), capped
 * at the 12-lane budget, tiled 2-up when more than 3. Deterministic and
 * silent; readout ids are stable (`auto:<nodeId>` / `auto:rail`) so builder
 * edits can diff against regenerations.
 */
export function autoLayoutSurface(
  definition: WorkflowDefinitionLike,
  options?: AutoLayoutOptions,
): RunSurfaceConfig {
  const nodes = definition.nodes;
  const nodeIds = new Set(nodes.map((n) => n.id));

  const hasOutgoing = new Set(definition.edges.map((e) => e.source));
  const terminalIds = new Set(
    nodes.filter((n) => !hasOutgoing.has(n.id)).map((n) => n.id),
  );

  const deliverableNodeId =
    options?.deliverableNodeId !== undefined && nodeIds.has(options.deliverableNodeId)
      ? options.deliverableNodeId
      : terminalIds.size === 1
        ? [...terminalIds][0]
        : undefined;

  const explicitPromote = new Set(
    (options?.promote ?? []).filter((id) => nodeIds.has(id)),
  );

  const small = nodes.length > 0 && nodes.length <= 3;

  // Rank each candidate for the cap: terminal + deliverable first, then
  // explicit promotions, then authored output_kind, then ai.*/child runs.
  // Within a rank, definition (graph) order — deterministic, no logging.
  const rankOf = (node: DefinitionNode): number | null => {
    if (node.id === deliverableNodeId || terminalIds.has(node.id)) return 0;
    if (explicitPromote.has(node.id)) return 1;
    if (hasOutputKind(node)) return 2;
    if (isAiOrChild(node)) return 3;
    if (small) return 4;
    return null;
  };

  const candidates = nodes
    .map((node, index) => ({ node, index, rank: rankOf(node) }))
    .filter((c): c is { node: DefinitionNode; index: number; rank: number } => c.rank !== null);
  candidates.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index));
  const promoted = candidates
    .slice(0, PROMOTION_CAP)
    // Tile in graph order regardless of promotion rank.
    .sort((a, b) => a.index - b.index)
    .map((c) => c.node);

  const railHeight = small ? 4 : 8;
  const rail: Readout = {
    id: "auto:rail",
    source: { kind: "progressRail" },
    pos: { x: 0, y: 0, w: GRID_COLUMNS, h: railHeight },
  };

  const twoUp = promoted.length > 3;
  const boxWidth = twoUp ? GRID_COLUMNS / 2 : GRID_COLUMNS;
  const boxHeight = 8;
  const readouts: Readout[] = [rail];
  promoted.forEach((node, i) => {
    const col = twoUp ? i % 2 : 0;
    const row = twoUp ? Math.floor(i / 2) : i;
    const source: ReadoutSource =
      specTypeOf(node) === "subgraph.call"
        ? { kind: "childRun", nodeId: node.id }
        : { kind: "node", nodeId: node.id };
    readouts.push({
      id: `auto:${node.id}`,
      source,
      pos: {
        x: col * boxWidth,
        y: railHeight + row * boxHeight,
        w: boxWidth,
        h: boxHeight,
      },
    });
  });

  return {
    schemaVersion: SURFACE_SCHEMA_VERSION,
    ...(deliverableNodeId !== undefined ? { deliverableNodeId } : {}),
    pages: [],
    readouts,
  };
}
