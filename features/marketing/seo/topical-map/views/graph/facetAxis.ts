// features/marketing/seo/topical-map/views/graph/facetAxis.ts
//
// THE FACET AXIS — the grouped facet's values as a separate clustered column to
// the LEFT of the topic tree, never mixed into it.
//
// Why a separate axis at all: when the drawing is grouped by a facet,
// `seo.map_graph` emits EVERY visible value of that facet in the organization,
// not just the ones this map uses. On All Green that is 255 regions, most of
// them with no edge to any topic. Dropping them into the same dagre graph as
// the topics produces 255 orphan nodes in a column dagre invents, which buries
// the map. Clustering them on their own axis, sorted by how much of the VISIBLE
// map they actually touch, turns the same bytes into the thing the person came
// for: which regions this branch is about.
//
// 🚨 FACET POSITIONS ARE COMPUTED EVERY RENDER AND NEVER PERSISTED. A facet
// value is not a topic: it has no `layout` column, it belongs to the
// organization rather than to this map, and `seo.map_topic.layout` is the only
// place this feature stores a position. `layout.ts` owns topic positions and
// knows nothing about this file, which is the structural reason a facet
// position can never leak into a topic's stored layout.
//
// Pure: no React, no xy-flow, no store. Tested directly.

import type { EntityRef } from "../../types";

import { ALL_FACET_VALUE_ID, type GraphFacetNode, type GraphModel } from "./model";

/** One value on the axis, with the visible topics it reaches. */
export interface FacetAxisValue {
  id: string;
  slug: string;
  name: string;
  facet: string;
  /** `seo.map_facet_value_ref` — the door. Null on the synthetic bucket. */
  ref: EntityRef | null;
  /** True for the synthetic `all` bucket (topics with no value for this facet). */
  isAll: boolean;
  /** The VISIBLE topic ids this value is joined to. */
  topicIds: string[];
}

export interface FacetAxis {
  /** The values drawn, in axis order. */
  values: FacetAxisValue[];
  /** Values the cap is holding back. 0 when everything is shown. */
  hiddenCount: number;
  /** Every value `map_graph` returned for this facet — shown or not. */
  totalCount: number;
  /** How many of the total touch no visible topic at all. */
  unusedCount: number;
  /** The facet key, or null when the drawing is not grouped. */
  facet: string | null;
}

export const EMPTY_FACET_AXIS: FacetAxis = {
  values: [],
  hiddenCount: 0,
  totalCount: 0,
  unusedCount: 0,
  facet: null,
};

/**
 * How many values the axis shows before the "+N more" node.
 *
 * This is a REVEAL STEP, not a ceiling: clicking "+N more" adds another step,
 * and there is no point at which the person is refused the rest. It is not a
 * knob because it is not a behavioural choice an organization would make — it
 * is how many pills fit beside a drawing before the column is taller than the
 * map it annotates. If it ever becomes a matter of taste, it becomes a knob.
 */
export const FACET_AXIS_REVEAL_STEP = 12;

function readValue(node: GraphFacetNode): {
  slug: string;
  name: string;
  facet: string;
  ref: EntityRef | null;
} {
  const data = node.data;
  const ref = (data as { ref?: EntityRef | null }).ref ?? null;
  return { slug: data.slug, name: data.name, facet: data.facet, ref };
}

/**
 * Build the axis for the currently visible topics.
 *
 * Order: most-connected first, then by name; the synthetic `all` bucket leads
 * the axis WHEN IT HAS EDGES, because "the topics with no region" is the first
 * thing a person regrouping a map wants to see. With no edges it has nothing to
 * say and sorts with the other empty values.
 */
export function buildFacetAxis(
  model: GraphModel,
  visibleIds: ReadonlySet<string>,
  shownCount: number = FACET_AXIS_REVEAL_STEP,
): FacetAxis {
  if (model.facetValues.length === 0) return { ...EMPTY_FACET_AXIS, facet: model.groupBy };

  const topicsByValueId = new Map<string, string[]>();
  for (const edge of model.facetEdges) {
    if (!visibleIds.has(edge.target)) continue;
    const list = topicsByValueId.get(edge.source);
    if (list) list.push(edge.target);
    else topicsByValueId.set(edge.source, [edge.target]);
  }

  const all: FacetAxisValue[] = model.facetValues.map((node) => {
    const value = readValue(node);
    return {
      id: node.id,
      slug: value.slug,
      name: value.name,
      facet: value.facet,
      ref: value.ref,
      isAll: node.id === ALL_FACET_VALUE_ID,
      topicIds: topicsByValueId.get(node.id) ?? [],
    };
  });

  const sorted = [...all].sort((a, b) => {
    const aAll = a.isAll && a.topicIds.length > 0;
    const bAll = b.isAll && b.topicIds.length > 0;
    if (aAll !== bAll) return aAll ? -1 : 1;
    if (a.topicIds.length !== b.topicIds.length) return b.topicIds.length - a.topicIds.length;
    return a.name.localeCompare(b.name);
  });

  const cap = Math.max(0, shownCount);
  const values = sorted.slice(0, cap);
  return {
    values,
    hiddenCount: Math.max(0, sorted.length - values.length),
    totalCount: sorted.length,
    unusedCount: sorted.filter((value) => value.topicIds.length === 0).length,
    facet: model.groupBy ?? values[0]?.facet ?? null,
  };
}

export interface FacetAxisLayoutOptions {
  /** The left edge of the topic drawing, in flow coordinates. */
  topicsLeft: number;
  /** The top edge of the topic drawing. */
  topicsTop: number;
  /** Width of one pill. */
  width: number;
  /** Height of one pill, plus the gap under it. */
  rowHeight: number;
  /** Gap between the axis column and the topic drawing. */
  gutter: number;
}

export const FACET_AXIS_LAYOUT: Omit<FacetAxisLayoutOptions, "topicsLeft" | "topicsTop"> = {
  width: 190,
  rowHeight: 44,
  gutter: 110,
};

/**
 * Where each axis pill sits. One column, top-aligned with the topic drawing,
 * `gutter` to its left — computed from the topics' own bounding box so the axis
 * follows the map rather than the map having to make room for it.
 *
 * The "+N more" node, when there is one, sits under the last pill and is
 * addressed by {@link FACET_AXIS_MORE_ID}.
 */
export const FACET_AXIS_MORE_ID = "__facet_axis_more__";

export function facetAxisPositions(
  axis: FacetAxis,
  options: FacetAxisLayoutOptions,
): Map<string, { x: number; y: number }> {
  const x = options.topicsLeft - options.gutter - options.width;
  const positions = new Map<string, { x: number; y: number }>();
  axis.values.forEach((value, index) => {
    positions.set(value.id, { x, y: options.topicsTop + index * options.rowHeight });
  });
  if (axis.hiddenCount > 0) {
    positions.set(FACET_AXIS_MORE_ID, {
      x,
      y: options.topicsTop + axis.values.length * options.rowHeight,
    });
  }
  return positions;
}
