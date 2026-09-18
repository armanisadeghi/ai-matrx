// features/marketing/seo/topical-map/views/graph/reconcile.ts
//
// WHICH POSITION A TOPIC KEEPS when the drawing is rebuilt.
//
// 🚨 A LIVE POSITION IS ONLY WORTH KEEPING INSIDE THE GEOMETRY IT WAS COMPUTED
// IN. The first landing kept `previousNode.position` unconditionally, which is
// right for a drag and wrong for everything else: the bands change the box a
// topic occupies (a 240×132 card, a 200×56 row, a 28×28 shape) and dagre lays
// the tree out for the band it was given. Focus a branch, the count drops, the
// band tips line → card, and every topic still on screen keeps coordinates
// computed for boxes a fifth of the size — so the cards land on top of each
// other and the map reads as broken. The band travels on the node's data
// exactly so this function can tell the two cases apart.
//
// And the other half: a position a PERSON chose is theirs in every band. Two
// things make a topic "placed":
//   - `map_graph` says `data.auto_layout === false` — there is a row in
//     `seo.map_topic.layout`, which is the person's own arrangement;
//   - this session dragged it. The drag has been written, but the graph query
//     is not invalidated by `useSetMapTopicLayout` (it invalidates `topicRows`),
//     so `query.data` still says `auto_layout: true` at the old spot and the
//     next recompute would walk the topic back to where the server last saw it.
//     The caller's dragged-id set closes that window from this side; the
//     invalidation is a coordinator request, and when it lands this stays true
//     rather than becoming wrong.
//
// Pure: no React, no xy-flow, no store. Tested directly.

import type { GraphBand } from "./bands";
import type { XY } from "./layout";

/** What the previous render left on the canvas for this topic. */
export interface KeptGraphNode {
  position: XY;
  /** The band that position was computed in. Null when it is not knowable. */
  band: GraphBand | null;
}

export interface ReconcilePositionInput {
  /** The node from the previous render, or null when this topic is new. */
  kept: KeptGraphNode | null;
  /** The band being drawn now. */
  band: GraphBand;
  /** The position this render computed for the current band. */
  computed: XY;
  /** True when a person placed this topic: a stored layout, or a drag this session. */
  placed: boolean;
}

/**
 * The position one topic is drawn at.
 *
 * - No previous node → the computed one; there is nothing to keep.
 * - Placed → the kept one, in every band. A person's arrangement is not
 *   geometry the drawing may recompute.
 * - Same band → the kept one. This is the drag case, and the whole reason a
 *   rebuild does not snap a moved node back.
 * - Different band → the computed one. The kept coordinates describe boxes that
 *   are no longer on the screen.
 */
export function reconcilePosition(input: ReconcilePositionInput): XY {
  const kept = input.kept;
  if (!kept) return input.computed;
  if (input.placed) return kept.position;
  return kept.band === input.band ? kept.position : input.computed;
}
