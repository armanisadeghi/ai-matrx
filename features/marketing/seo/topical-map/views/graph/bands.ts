// features/marketing/seo/topical-map/views/graph/bands.ts
//
// THE ZOOM BANDS (CONTRACTS §7, plan §6 C). How much of a topic a drawing can
// honestly show depends on how many topics are in front of the person — 14
// topics get a readable card each, 200 get a dot. The three cut points are
// KNOBS (`graph_band_card_max`, `graph_band_compact_max`, `graph_band_line_max`),
// never constants here: an organization that wants cards up to 40 topics says so
// in its settings, and this file must not have an opinion about it.
//
// 🚨 ARMAN, 2026-08-20 (the SiteMap ruling this band system inherits): at the
// CARD band every topic is a real rectangular card whose TITLE IS READABLE —
// it wraps, it is never truncated. That is why the card geometry below is tall
// enough for three lines of title and why `nodes.tsx` uses `whitespace-normal
// break-words` rather than `truncate`.
//
// Pure: no React, no xy-flow, no store. Tested directly.

/** What one topic looks like at the current density. */
export type GraphBand = "card" | "compact" | "line" | "shape";

/** The three cut points, read off the knobs. */
export interface GraphBandThresholds {
  graph_band_card_max: number;
  graph_band_compact_max: number;
  graph_band_line_max: number;
}

/**
 * Which band a drawing of `visibleTopicCount` topics is in.
 *
 * The comparisons are inclusive upper bounds: with `card_max = 15`, fifteen
 * topics are still cards and the sixteenth tips the whole drawing to compact.
 * Anything past `line_max` is the shape band — there is no fifth band, and no
 * cap: a 4,000-topic map draws 4,000 shapes rather than pretending it cannot.
 */
export function bandFor(
  visibleTopicCount: number,
  thresholds: GraphBandThresholds,
): GraphBand {
  if (visibleTopicCount <= thresholds.graph_band_card_max) return "card";
  if (visibleTopicCount <= thresholds.graph_band_compact_max) return "compact";
  if (visibleTopicCount <= thresholds.graph_band_line_max) return "line";
  return "shape";
}

/**
 * The drawn size of one topic in each band, and the font size its label is set
 * in. `fontPx` is not decoration: it is what the legibility floor in
 * `GraphViewImpl` multiplies by the live zoom to decide whether a label can
 * still be read at all.
 *
 * Geometry, not taste — these are the pixels dagre needs in order to lay nodes
 * out without overlap, the way `ORCH_W`/`MEM_W` are in the orchestra canvas.
 */
export interface GraphBandGeometry {
  width: number;
  height: number;
  /** The rendered label's font size in CSS px at zoom 1. */
  fontPx: number;
  /** Horizontal gap dagre leaves between siblings. */
  nodeSep: number;
  /** Vertical gap dagre leaves between ranks. */
  rankSep: number;
}

export const GRAPH_BAND_GEOMETRY: Record<GraphBand, GraphBandGeometry> = {
  // 240px wide, three lines of 13px title + a counts line + the status mark.
  card: { width: 240, height: 132, fontPx: 13, nodeSep: 44, rankSep: 96 },
  compact: { width: 200, height: 56, fontPx: 12, nodeSep: 28, rankSep: 64 },
  line: { width: 220, height: 44, fontPx: 12, nodeSep: 18, rankSep: 64 },
  shape: { width: 28, height: 28, fontPx: 10, nodeSep: 14, rankSep: 34 },
};

/** What the toolbar calls this band out loud. Never a code word on a screen. */
export function graphBandLabel(band: GraphBand): string {
  switch (band) {
    case "card":
      return "cards";
    case "compact":
      return "compact rows";
    case "line":
      return "lines";
    case "shape":
      return "shapes";
  }
}

/**
 * The size multiplier the `size` encoding applies to one topic, given its own
 * value and the largest value among the visible topics.
 *
 * Deliberately gentle (1.0 → 1.35): a node that doubles in size stops lining up
 * with its siblings and the tree reads as broken. The scale is applied to the
 * band geometry, so dagre is laid out on the unscaled box and the growth
 * happens inside the slot.
 */
export const GRAPH_SIZE_SCALE_MIN = 1;
export const GRAPH_SIZE_SCALE_MAX = 1.35;

export function sizeScale(value: number, max: number): number {
  if (max <= 0 || value <= 0) return GRAPH_SIZE_SCALE_MIN;
  const ratio = Math.min(value / max, 1);
  return GRAPH_SIZE_SCALE_MIN + ratio * (GRAPH_SIZE_SCALE_MAX - GRAPH_SIZE_SCALE_MIN);
}
