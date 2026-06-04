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

// Per-instance analysis cache. The expensive passes (PageRank, Markov) run at
// most ONCE per element set, and only when an encoding actually needs them — the
// default kind/connections view triggers neither, which is the fast first paint.
// A WeakMap is GC'd when the cy instance is destroyed (unmount).
interface AnalysisState {
  importanceDone: boolean;
  communityDone: boolean;
  communityCount: number;
}
const analysisCache = new WeakMap<cytoscape.Core, AnalysisState>();

function stateFor(cy: cytoscape.Core): AnalysisState {
  let s = analysisCache.get(cy);
  if (!s) {
    s = { importanceDone: false, communityDone: false, communityCount: 0 };
    analysisCache.set(cy, s);
  }
  return s;
}

/** Invalidate cached analysis — call after swapping the element set so the next
 *  encoding recomputes against the new graph. */
export function resetAnalysis(cy: cytoscape.Core): void {
  const s = stateFor(cy);
  s.importanceDone = false;
  s.communityDone = false;
  s.communityCount = 0;
}

/** PageRank importance → node data. Cheap (~10ms) but still skipped unless the
 *  size encoding needs it. Computed at most once per element set. */
function ensureImportance(cy: cytoscape.Core): void {
  const s = stateFor(cy);
  if (s.importanceDone) return;
  const nodes = cy.nodes();
  if (nodes.empty()) {
    s.importanceDone = true;
    return;
  }
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
  cy.batch(() => {
    nodes.forEach((n) => {
      const importance = ((ranks.get(n.id()) ?? min) - min) / span;
      n.data("importance", importance);
      n.data("sizeImportance", importanceSize(importance));
    });
  });
  s.importanceDone = true;
}

/** Markov community detection → node data. The heavier pass (~300ms at 5.6k
 *  edges), so it only runs when the colour encoding needs it. Returns the
 *  multi-node community count. Computed at most once per element set. */
function ensureCommunity(cy: cytoscape.Core): number {
  const s = stateFor(cy);
  if (s.communityDone) return s.communityCount;
  const nodes = cy.nodes();
  if (nodes.empty()) {
    s.communityDone = true;
    return 0;
  }
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
    // only groups of 2+ get a distinct colour
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
  s.communityDone = true;
  s.communityCount = communityCount;
  return communityCount;
}

/** Point each node's render `color`/`size` at the chosen encoding, lazily running
 *  only the analysis that encoding requires (PageRank for "importance", Markov for
 *  "community"). The default kind/connections encoding triggers NO analysis.
 *  Returns the detected community count for the legend. */
export function applyEncoding(
  cy: cytoscape.Core,
  colorBy: KgColorBy,
  sizeBy: KgSizeBy,
): GraphAnalysis {
  if (colorBy === "community") ensureCommunity(cy);
  if (sizeBy === "importance") ensureImportance(cy);
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
  return { communityCount: stateFor(cy).communityCount };
}
