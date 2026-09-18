// features/marketing/seo/topical-map/views/graph/model.ts
//
// `seo.map_graph`'s document, narrowed into the typed maps the drawing walks.
//
// 🚨 AN UNKNOWN NODE OR EDGE TYPE IS SKIPPED, LOUDLY — never a crash, never a
// silent drop. `map_graph` is a database function that a future migration can
// teach a third node type; a build that has not been taught it must still draw
// the map it DOES understand and must tell the Error Inspector what it left
// out (CLAUDE.md: nothing fails silently). The counts travel on the model so a
// screen can say so out loud rather than showing a quietly thinner tree.
//
// Pure: no React, no xy-flow, no store. Tested directly.

import { captureError } from "@/lib/diagnostics/errorCaptureStore";

import type {
  MapGraphAllFacetValueNode,
  MapGraphFacetEdge,
  MapGraphFacetValueNode,
  MapGraphResult,
  MapGraphTopicNode,
  MapGraphTreeEdge,
} from "../../types";

/** A real facet value, or the synthetic `all` bucket. Both draw the same way. */
export type GraphFacetNode = MapGraphFacetValueNode | MapGraphAllFacetValueNode;

/** The synthetic bucket's id. `map_graph` emits it verbatim; it is not a uuid. */
export const ALL_FACET_VALUE_ID = "all";

export interface GraphModel {
  /** Topic nodes in the order `map_graph` returned them (tree path order). */
  topics: MapGraphTopicNode[];
  topicById: Map<string, MapGraphTopicNode>;
  topicBySlug: Map<string, MapGraphTopicNode>;
  /** Every facet value of the grouped facet the org has, edges or not. */
  facetValues: GraphFacetNode[];
  treeEdges: MapGraphTreeEdge[];
  facetEdges: MapGraphFacetEdge[];
  /** Parent topic id → its child topic ids, from the tree edges. */
  childrenByParentId: Map<string, string[]>;
  /** The facet the server grouped by, or null when it grouped by nothing. */
  groupBy: string | null;
  /** Nodes whose `type` this build does not know. Reported, never hidden. */
  skippedNodes: number;
  /** Edges whose `type` this build does not know. */
  skippedEdges: number;
}

export const EMPTY_GRAPH_MODEL: GraphModel = {
  topics: [],
  topicById: new Map(),
  topicBySlug: new Map(),
  facetValues: [],
  treeEdges: [],
  facetEdges: [],
  childrenByParentId: new Map(),
  groupBy: null,
  skippedNodes: 0,
  skippedEdges: 0,
};

function captureUnknown(kind: "node" | "edge", type: string): void {
  try {
    captureError({
      source: "topical-map-rpc",
      relation: "seo.map_graph",
      // `map_graph` is reached through an RPC, which is the vocabulary
      // `CapturedOperation` speaks.
      operation: "rpc",
      message: `seo.map_graph returned a ${kind} of type "${type}", which this build does not draw.`,
      userMessage:
        "Part of this map drawing came back in a shape this app does not know yet, so it is not drawn.",
      hint: "Teach features/marketing/seo/topical-map/views/graph/model.ts the new type, or check the seo.map_graph migration.",
      callSite: "features/marketing/seo/topical-map/views/graph/model.ts",
    });
  } catch {
    // Capture is best-effort — it must never take the drawing down.
  }
}

/**
 * Narrow one `map_graph` document. Every branch reads `type` off a widened view
 * of the node because the DECLARED union is only what this build was compiled
 * against — the bytes on the wire are whatever the live function emits.
 */
export function buildGraphModel(result: MapGraphResult | null | undefined): GraphModel {
  if (!result) return EMPTY_GRAPH_MODEL;

  const topics: MapGraphTopicNode[] = [];
  const facetValues: GraphFacetNode[] = [];
  const treeEdges: MapGraphTreeEdge[] = [];
  const facetEdges: MapGraphFacetEdge[] = [];
  let skippedNodes = 0;
  let skippedEdges = 0;

  for (const node of result.nodes ?? []) {
    const type: unknown = (node as { type?: unknown }).type;
    if (type === "topic") {
      topics.push(node as MapGraphTopicNode);
    } else if (type === "facet_value") {
      facetValues.push(node as GraphFacetNode);
    } else {
      skippedNodes += 1;
      captureUnknown("node", String(type));
    }
  }

  for (const edge of result.edges ?? []) {
    const type: unknown = (edge as { type?: unknown }).type;
    if (type === "tree") {
      treeEdges.push(edge as MapGraphTreeEdge);
    } else if (type === "facet") {
      facetEdges.push(edge as MapGraphFacetEdge);
    } else {
      skippedEdges += 1;
      captureUnknown("edge", String(type));
    }
  }

  const topicById = new Map<string, MapGraphTopicNode>();
  const topicBySlug = new Map<string, MapGraphTopicNode>();
  for (const topic of topics) {
    topicById.set(topic.id, topic);
    topicBySlug.set(topic.data.slug, topic);
  }

  const childrenByParentId = new Map<string, string[]>();
  for (const edge of treeEdges) {
    // A tree edge into a topic this read did not return is not a child we can
    // draw — `map_graph` emits only active and proposed topics, so an edge to a
    // retired parent is expected and is not an error.
    if (!topicById.has(edge.target)) continue;
    const siblings = childrenByParentId.get(edge.source);
    if (siblings) siblings.push(edge.target);
    else childrenByParentId.set(edge.source, [edge.target]);
  }

  return {
    topics,
    topicById,
    topicBySlug,
    facetValues,
    treeEdges,
    facetEdges,
    childrenByParentId,
    groupBy: result.group_by ?? null,
    skippedNodes,
    skippedEdges,
  };
}

/**
 * The topics one focus shows: the focused topic and every descendant of it,
 * walked through the tree edges. `focusSlug === null` means the whole map.
 *
 * A focus slug the drawing does not hold (a topic that was retired while the
 * person was looking at it, or a stale store entry) returns EVERY topic rather
 * than an empty canvas — an empty drawing would read as "this map is empty",
 * which is a lie. `GraphToolbar` says out loud that the focus could not be
 * found; between them the person gets the map and the explanation.
 */
export function visibleTopicIds(
  model: GraphModel,
  focusSlug: string | null,
): Set<string> {
  const all = new Set(model.topics.map((topic) => topic.id));
  if (!focusSlug) return all;
  const root = model.topicBySlug.get(focusSlug);
  if (!root) return all;

  const visible = new Set<string>([root.id]);
  const queue: string[] = [root.id];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const childId of model.childrenByParentId.get(id) ?? []) {
      // The guard is against a cycle, which the tree must not contain and
      // which would otherwise spin this loop forever.
      if (visible.has(childId)) continue;
      visible.add(childId);
      queue.push(childId);
    }
  }
  return visible;
}

/** The visible topics, in `map_graph`'s own order. */
export function visibleTopics(
  model: GraphModel,
  visibleIds: ReadonlySet<string>,
): MapGraphTopicNode[] {
  return model.topics.filter((topic) => visibleIds.has(topic.id));
}

/** The tree edges whose BOTH ends are visible — the only ones worth drawing. */
export function visibleTreeEdges(
  model: GraphModel,
  visibleIds: ReadonlySet<string>,
): MapGraphTreeEdge[] {
  return model.treeEdges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );
}
