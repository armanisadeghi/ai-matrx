// features/marketing/seo/topical-map/views/graph/layout.ts
//
// WHERE THE TOPICS SIT. dagre top-down over the tree edges of the VISIBLE
// topics, reconciled with what the person has already arranged by hand.
//
// Two sources of truth, and `seo.map_graph` tells them apart for us:
//   - `data.auto_layout === true` — `seo.map_topic.layout` IS NULL. Nobody has
//     placed this topic; its `position` came back as {0,0}, which is a
//     placeholder, not a position.
//   - `data.auto_layout === false` — a stored layout. It is the person's
//     arrangement and is NEVER overwritten by a render.
//
// 🚨 THE KNOB NEVER MEANS "STACK THEM AT THE ORIGIN". `graph_auto_layout`
// off does not turn an unplaced topic into a pile on top of the first one —
// fifty topics at {0,0} is a dead screen, and a dead screen is the one thing a
// drawing may never be (CLAUDE.md law 4). So unplaced topics are laid out by
// dagre in BOTH states, and the knob decides how that layout RELATES to the
// arrangement already on the canvas:
//   - ON  — one dagre pass over the whole visible tree: placed and unplaced
//           topics flow together, so a new branch lands inside the shape of the
//           map rather than beside it.
//   - OFF — the same dagre pass, then the unplaced topics are translated CLEAR
//           of the bounding box of everything the person placed. "Do not
//           auto-arrange my map" is honoured literally: nothing the person put
//           somewhere is flowed around, and the new arrivals appear in a fresh
//           column to the right of their work.
//
// "Auto-arrange" (the toolbar control) is a different thing again: it re-lays
// EVERY visible topic in VIEW state only and writes nothing. Fifty layout
// writes because somebody wanted to see the tree straightened is not an
// arrangement anybody asked to keep.
//
// Pure: no React, no xy-flow, no store. Tested directly.

import dagre from "dagre";

import type { MapGraphTopicNode, MapGraphTreeEdge } from "../../types";

export interface XY {
  x: number;
  y: number;
}

export interface TopicLayoutInput {
  /** The visible topics, in `map_graph` order. */
  topics: readonly MapGraphTopicNode[];
  /** Tree edges with both ends visible. */
  treeEdges: readonly MapGraphTreeEdge[];
  /** One node's box — the band geometry. */
  width: number;
  height: number;
  nodeSep: number;
  rankSep: number;
  /** `graph_auto_layout`. See the header for what each state does. */
  autoLayout: boolean;
}

/** The gap left between a hand-arranged cluster and the auto-placed column. */
const UNPLACED_COLUMN_GUTTER = 120;

function dagrePositions(input: TopicLayoutInput): Map<string, XY> {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "TB",
    nodesep: input.nodeSep,
    ranksep: input.rankSep,
    marginx: 24,
    marginy: 24,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  const ids = new Set<string>();
  for (const topic of input.topics) {
    graph.setNode(topic.id, { width: input.width, height: input.height });
    ids.add(topic.id);
  }
  for (const edge of input.treeEdges) {
    if (ids.has(edge.source) && ids.has(edge.target)) graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);

  const out = new Map<string, XY>();
  for (const topic of input.topics) {
    const node = graph.node(topic.id);
    // dagre centres its nodes; React Flow positions by the top-left corner.
    out.set(topic.id, {
      x: (node?.x ?? 0) - input.width / 2,
      y: (node?.y ?? 0) - input.height / 2,
    });
  }
  return out;
}

function boundingRight(
  topics: readonly MapGraphTopicNode[],
  width: number,
): { right: number; top: number } | null {
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let seen = false;
  for (const topic of topics) {
    seen = true;
    right = Math.max(right, topic.position.x + width);
    top = Math.min(top, topic.position.y);
  }
  return seen ? { right, top } : null;
}

/**
 * The position of every visible topic: stored layouts kept as they are, unplaced
 * topics given a dagre slot.
 */
export function layoutTopics(input: TopicLayoutInput): Map<string, XY> {
  const placed = input.topics.filter((topic) => topic.data.auto_layout === false);
  const unplaced = input.topics.filter((topic) => topic.data.auto_layout !== false);

  const positions = new Map<string, XY>();
  for (const topic of placed) {
    positions.set(topic.id, { x: topic.position.x, y: topic.position.y });
  }
  if (unplaced.length === 0) return positions;

  const dagreAll = dagrePositions(input);

  if (input.autoLayout) {
    for (const topic of unplaced) {
      positions.set(topic.id, dagreAll.get(topic.id) ?? { x: 0, y: 0 });
    }
    return positions;
  }

  // OFF: keep the person's arrangement untouched and put the arrivals clear of
  // it. The translation is computed from the unplaced set's own dagre bounding
  // box so the shape of the new branch survives the move.
  const anchor = boundingRight(placed, input.width);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const topic of unplaced) {
    const position = dagreAll.get(topic.id);
    if (!position) continue;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
  }
  const dx = anchor ? anchor.right + UNPLACED_COLUMN_GUTTER - minX : 0;
  const dy = anchor ? anchor.top - minY : 0;
  for (const topic of unplaced) {
    const position = dagreAll.get(topic.id) ?? { x: 0, y: 0 };
    positions.set(topic.id, { x: position.x + dx, y: position.y + dy });
  }
  return positions;
}

/**
 * "Auto-arrange" — every visible topic straight off dagre, stored layouts
 * included. VIEW STATE ONLY: the caller pushes these into React Flow and writes
 * nothing to the database.
 */
export function autoArrangeTopics(input: TopicLayoutInput): Map<string, XY> {
  return dagrePositions(input);
}

/** The top-left corner of a set of positions — where the facet axis anchors. */
export function topLeftOf(positions: Iterable<XY>): XY {
  let x = Number.POSITIVE_INFINITY;
  let y = Number.POSITIVE_INFINITY;
  let seen = false;
  for (const position of positions) {
    seen = true;
    x = Math.min(x, position.x);
    y = Math.min(y, position.y);
  }
  return seen ? { x, y } : { x: 0, y: 0 };
}
