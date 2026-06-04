// features/kg-graph/cytoscape/analysis.ts
//
// Graph-analysis helpers that run against a live cytoscape instance. These turn
// a raw node/edge set into a *meaningful* visualization:
//   - importance via PageRank (link-analysis, not just raw degree) → node size
//   - communities via Markov clustering → node colour
// Both are computed once after elements are added, cached into element `data`,
// then surfaced by `applyEncoding` so the colour/size toggles are instant (no
// recompute). All algorithms ship in cytoscape core 3.x.

import type cytoscape from "cytoscape";

import type { GraphEdge, GraphNode } from "../types";
import {
  KG_NODE_MAX_SIZE,
  KG_NODE_MIN_SIZE,
  colorForKind,
} from "../constants";

export type KgColorBy = "kind" | "community";
export type KgSizeBy = "connections" | "importance";

// Distinct hues for detected communities — mid-saturation so they read on both
// the light and dark canvas. Singleton "communities" fall back to neutral grey
// so the palette stays meaningful (only real groups get a colour).
const KG_COMMUNITY_PALETTE = [
  "#6366f1", "#0ea5e9", "#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6",
  "#84cc16", "#10b981", "#ef4444", "#06b6d4", "#a855f7", "#eab308",
];
const KG_SINGLETON_COLOR = "#64748b"; // slate-500

// Connectivity/mention → size (log scale so a degree-97 hub doesn't dwarf all).
function connectionsSize(degree: number, mentionCount: number): number {
  const signal = Math.max(degree, mentionCount);
  const scaled = Math.log2(signal + 1) / Math.log2(100);
  const size = KG_NODE_MIN_SIZE + scaled * (KG_NODE_MAX_SIZE - KG_NODE_MIN_SIZE);
  return Math.round(Math.min(Math.max(size, KG_NODE_MIN_SIZE), KG_NODE_MAX_SIZE));
}

// Normalized importance (0..1) → size, sqrt-spread so mid nodes stay visible.
function importanceSize(importance: number): number {
  const size =
    KG_NODE_MIN_SIZE + Math.sqrt(importance) * (KG_NODE_MAX_SIZE - KG_NODE_MIN_SIZE);
  return Math.round(Math.min(Math.max(size, KG_NODE_MIN_SIZE), KG_NODE_MAX_SIZE));
}

/** Build cytoscape elements. Each node carries both encodings precomputed where
 *  possible (kind colour + connections size); importance/community are filled in
 *  by `annotateGraph` once the graph exists. `color`/`size` seed the first paint. */
export function buildElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
): cytoscape.ElementDefinition[] {
  const degree: Record<string, number> = {};
  for (const e of edges) {
    degree[e.source] = (degree[e.source] ?? 0) + 1;
    degree[e.target] = (degree[e.target] ?? 0) + 1;
  }

  const nodeEls: cytoscape.ElementDefinition[] = nodes.map((n) => {
    const kindColor = colorForKind(n.kind);
    const sizeConnections = connectionsSize(degree[n.id] ?? 0, n.mention_count);
    return {
      group: "nodes",
      data: {
        id: n.id,
        label: n.name,
        kind: n.kind,
        kindColor,
        communityColor: KG_SINGLETON_COLOR,
        degree: degree[n.id] ?? 0,
        mention_count: n.mention_count,
        importance: 0,
        community: -1,
        sizeConnections,
        sizeImportance: KG_NODE_MIN_SIZE,
        // seed first paint with the default encoding
        color: kindColor,
        size: sizeConnections,
      },
    };
  });

  const edgeEls: cytoscape.ElementDefinition[] = edges.map((e) => ({
    group: "edges",
    data: {
      id: e.id,
      source: e.source,
      target: e.target,
      weight: e.weight ?? 1,
    },
  }));

  return [...nodeEls, ...edgeEls];
}

export interface GraphAnalysis {
  /** Number of multi-node communities detected (singletons excluded). */
  communityCount: number;
}

/** Compute PageRank importance + Markov communities and cache them into node
 *  `data`. Run once after elements are added, before the first `applyEncoding`. */
export function annotateGraph(cy: cytoscape.Core): GraphAnalysis {
  const nodes = cy.nodes();
  if (nodes.empty()) return { communityCount: 0 };

  // --- importance: PageRank, normalized to 0..1 across the graph ---
  const pr = cy.elements().pageRank({});
  let min = Infinity;
  let max = -Infinity;
  const ranks = new Map<string, number>();
  nodes.forEach((n) => {
    const r = pr.rank(n);
    ranks.set(n.id(), r);
    if (r < min) min = r;
    if (r > max) max = r;
  });
  const span = max - min || 1;

  // --- communities: Markov clustering, weighted by edge weight ---
  // markovClustering returns one NodeCollection per cluster.
  let clusters: cytoscape.NodeCollection[] = [];
  try {
    clusters = cy.elements().markovClustering({
      attributes: [(e: cytoscape.EdgeSingular) => Number(e.data("weight")) || 1],
      inflateFactor: 2.2,
    });
  } catch {
    clusters = [];
  }

  let communityCount = 0;
  cy.batch(() => {
    // importance
    nodes.forEach((n) => {
      const rank = ranks.get(n.id()) ?? min;
      const importance = (rank - min) / span;
      n.data("importance", importance);
      n.data("sizeImportance", importanceSize(importance));
    });
    // communities — only groups of 2+ get a distinct colour
    clusters.forEach((cluster) => {
      if (cluster.length >= 2) {
        const color =
          KG_COMMUNITY_PALETTE[communityCount % KG_COMMUNITY_PALETTE.length];
        const idx = communityCount;
        cluster.forEach((m) => {
          m.data("community", idx);
          m.data("communityColor", color);
        });
        communityCount += 1;
      }
    });
  });

  return { communityCount };
}

/** Point each node's render `color`/`size` at the chosen encoding. Cheap — reads
 *  the values `annotateGraph` cached. Setting data re-evaluates style mappers. */
export function applyEncoding(
  cy: cytoscape.Core,
  colorBy: KgColorBy,
  sizeBy: KgSizeBy,
): void {
  cy.batch(() => {
    cy.nodes().forEach((n) => {
      n.data(
        "color",
        colorBy === "community" ? n.data("communityColor") : n.data("kindColor"),
      );
      n.data(
        "size",
        sizeBy === "importance" ? n.data("sizeImportance") : n.data("sizeConnections"),
      );
    });
  });
}
