// features/marketing/seo/topical-map/views/graph/__fixtures__/mapGraph.ts
//
// 🚨 DERIVED from the function body in migration 17
// (`20260915230000_seo_topical_map_17_null_guards_and_edge_payloads.sql`,
// `seo.map_graph`'s `jsonb_build_object` calls), NOT recorded from the live
// database — this build has NO database access. The coordinator's browser walk
// on All Green is the live proof; nothing below may be read as evidence that the
// server emits these bytes.
//
// What the function body says, key by key, and therefore what this file builds:
//
//   topic node    {id, type:"topic", position: layout ?? {x:0,y:0},
//                  data:{slug, name, description, status, depth, sort_order,
//                        parent_id, page_count, planned_count, keyword_count,
//                        facets:{<facetKey>:<valueSlug>},
//                        auto_layout: (layout IS NULL)}}
//                 …emitted in tree-path order, and ONLY for active and proposed
//                 topics (retired and rejected never appear).
//   facet value   {id, type:"facet_value",
//                  data:{slug, name, facet, parent_id, ref}}
//                 …EVERY visible value of the grouped facet in the org/brand,
//                 whether or not any topic uses it.
//   the `all`     {id:"all", type:"facet_value", data:{slug:"all", name:"All",
//                  facet}} — the synthetic bucket a topic with no value for the
//                 facet hangs off (the LEFT JOIN's null side).
//   tree edge     {id:`${parent}-${child}`, source, target, type:"tree"}
//   facet edge    {id, source: valueId|"all", target: topicId, type:"facet",
//                  inherited}  — exactly one per topic.
//
// Four worlds, because the bands and the axis are the two things whose
// behaviour changes with scale:
//   15 visible · 40 visible · 200 visible topics · a grouped world with 255
//   facet values of which 30 carry an edge, plus `all`.

import type {
  MapGraphAllFacetValueNode,
  MapGraphFacetEdge,
  MapGraphFacetValueNode,
  MapGraphResult,
  MapGraphTopicNode,
  MapGraphTreeEdge,
} from "../../../types";

const MAP_ID = "11111111-1111-4111-8111-111111111111";

/** Deterministic, readable ids — a uuid's shape without a uuid's noise. */
function topicId(index: number): string {
  return `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`;
}
function valueId(index: number): string {
  return `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`;
}

export interface TopicSpec {
  index: number;
  parentIndex: number | null;
  /** A stored `seo.map_topic.layout`; omitted means layout IS NULL. */
  layout?: { x: number; y: number };
  status?: string;
  page_count?: number;
  planned_count?: number;
  keyword_count?: number;
  facets?: Record<string, string>;
}

export function topicNode(spec: TopicSpec, depth: number): MapGraphTopicNode {
  return {
    id: topicId(spec.index),
    type: "topic",
    // `position: layout ?? {x:0,y:0}` — the {0,0} is a PLACEHOLDER, and
    // `auto_layout` is the only thing that says so.
    position: spec.layout ?? { x: 0, y: 0 },
    data: {
      slug: `topic-${spec.index}`,
      name: `Topic ${spec.index}`,
      description: null,
      status: spec.status ?? "active",
      depth,
      sort_order: spec.index,
      parent_id: spec.parentIndex === null ? null : topicId(spec.parentIndex),
      page_count: spec.page_count ?? 0,
      planned_count: spec.planned_count ?? 0,
      keyword_count: spec.keyword_count ?? 0,
      facets: spec.facets ?? {},
      auto_layout: spec.layout === undefined,
    },
  };
}

export function treeEdge(parentIndex: number, childIndex: number): MapGraphTreeEdge {
  return {
    id: `${topicId(parentIndex)}-${topicId(childIndex)}`,
    source: topicId(parentIndex),
    target: topicId(childIndex),
    type: "tree",
  };
}

/**
 * A map of `count` topics: index 1 is the root, and every later topic hangs off
 * the root unless `fanout` puts it under an earlier child. Depth is computed the
 * way the function's recursive walk computes it.
 */
export function buildTopicWorld(count: number, specs: Partial<Record<number, TopicSpec>> = {}) {
  const nodes: MapGraphTopicNode[] = [];
  const edges: MapGraphTreeEdge[] = [];
  const depthByIndex = new Map<number, number>();

  for (let index = 1; index <= count; index += 1) {
    const override = specs[index];
    const parentIndex = index === 1 ? null : (override?.parentIndex ?? 1);
    const depth = parentIndex === null ? 0 : (depthByIndex.get(parentIndex) ?? 0) + 1;
    depthByIndex.set(index, depth);
    nodes.push(topicNode({ ...(override ?? {}), index, parentIndex }, depth));
    if (parentIndex !== null) edges.push(treeEdge(parentIndex, index));
  }
  return { nodes, edges };
}

export function mapGraphResult(
  nodes: (MapGraphTopicNode | MapGraphFacetValueNode | MapGraphAllFacetValueNode)[],
  edges: (MapGraphTreeEdge | MapGraphFacetEdge)[],
  groupBy: string | null = null,
): MapGraphResult {
  return { map_id: MAP_ID, group_by: groupBy, site_id: null, nodes, edges };
}

/** 15 topics — the card band on the live default (`graph_band_card_max` 15). */
export function world15(): MapGraphResult {
  const world = buildTopicWorld(15, {
    2: { index: 2, parentIndex: 1, page_count: 12, planned_count: 3, keyword_count: 40 },
    3: { index: 3, parentIndex: 2, layout: { x: 400, y: 260 }, page_count: 4 },
    4: { index: 4, parentIndex: 2, status: "proposed" },
  });
  return mapGraphResult(world.nodes, world.edges);
}

/** 40 topics — the compact band on the live default. */
export function world40(): MapGraphResult {
  const world = buildTopicWorld(40);
  return mapGraphResult(world.nodes, world.edges);
}

/** 200 topics — the line band on the live default. */
export function world200(): MapGraphResult {
  const world = buildTopicWorld(200);
  return mapGraphResult(world.nodes, world.edges);
}

/**
 * A root with exactly 14 descendants inside a bigger map — the focus case.
 * Topic 1 is the root of everything; topic 2 owns 14 descendants (3..16); the
 * remaining topics hang off the root and must disappear when 2 is focused.
 */
export function focusWorld(): MapGraphResult {
  const specs: Record<number, TopicSpec> = {};
  for (let index = 3; index <= 16; index += 1) {
    specs[index] = { index, parentIndex: index === 3 ? 2 : index - 1 };
  }
  const world = buildTopicWorld(30, specs);
  return mapGraphResult(world.nodes, world.edges);
}

export const REGION_FACET = "region";

/**
 * The grouped world: 255 region values, 30 of which carry an edge, plus the
 * synthetic `all` bucket carrying the rest of the topics. One facet edge per
 * topic, exactly as the function's LEFT JOIN emits.
 */
export function groupedWorld(topicCount = 40, valuesWithEdges = 30): MapGraphResult {
  const world = buildTopicWorld(topicCount);
  const values: (MapGraphFacetValueNode | MapGraphAllFacetValueNode)[] = [];
  for (let index = 1; index <= 255; index += 1) {
    values.push({
      id: valueId(index),
      type: "facet_value",
      data: {
        slug: `region-${String(index).padStart(3, "0")}`,
        name: `Region ${String(index).padStart(3, "0")}`,
        facet: REGION_FACET,
        parent_id: null,
        // A resolved ref on the odd values, a hidden one on the even — both
        // shapes are real (`platform.resolve_entity_ref` returns {type,hidden}
        // for anything the caller cannot open).
        ref:
          index % 2 === 1
            ? { type: "region", id: valueId(index), label: `Region ${index}` }
            : { type: "region", hidden: true },
      },
    });
  }
  const allNode: MapGraphAllFacetValueNode = {
    id: "all",
    type: "facet_value",
    data: { slug: "all", name: "All", facet: REGION_FACET },
  };
  values.push(allNode);

  // One facet edge per topic: the first `valuesWithEdges` topics spread over
  // the first `valuesWithEdges` values, the rest on the `all` bucket.
  const facetEdges: MapGraphFacetEdge[] = world.nodes.map((topic, position) => {
    const onValue = position < valuesWithEdges;
    return {
      id: `facet-${position}`,
      source: onValue ? valueId(position + 1) : "all",
      target: topic.id,
      type: "facet",
      inherited: position % 5 === 0,
    };
  });

  return mapGraphResult(
    [...world.nodes, ...values],
    [...world.edges, ...facetEdges],
    REGION_FACET,
  );
}
