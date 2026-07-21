// features/marketing/components/inspection/link-graph/style.ts
//
// Visual language for the site link graph. REUSES the kg-graph cytoscape
// engine's stylesheet + theme chrome + interaction classes (so focus / fade /
// search ops work unchanged) and layers the link-graph-specific semantics on
// top: DIRECTED arrow edges (links have direction; KG uses undirected
// haystack), diamond shape for external targets, a ring on the homepage,
// dashed nofollow edges, red broken edges.
//
// Node color/size are precomputed by the view (depth ramp or status hues) and
// fed via element data — same contract as kg-graph.

import type cytoscape from "cytoscape";

import { kgChrome, KG_TIER_PALETTE } from "@/features/kg-graph/constants";
import type { ThemeMode } from "@/styles/themes/types";
import { buildStylesheet, KG_CLASS } from "@/features/kg-graph/cytoscape/style";

import type { LinkGraphNode, LinkNodeStatus } from "./model";

export type LinkColorMode = "depth" | "status";

// Status hues — raw hex (cytoscape can't read CSS vars), legible on both themes.
export const LINK_STATUS_COLORS: Record<LinkNodeStatus, string> = {
  ok: "#10b981", // emerald
  redirect: "#f59e0b", // amber
  broken: "#ef4444", // red
  unchecked: "#64748b", // slate
};

export const LINK_STATUS_LABELS: Record<LinkNodeStatus, string> = {
  ok: "OK (2xx)",
  redirect: "Redirect (3xx)",
  broken: "Broken (4xx/5xx)",
  unchecked: "Not checked",
};

/** External targets in either color mode. */
export const LINK_EXTERNAL_COLOR = "#94a3b8"; // slate-400

export const LINK_BROKEN_EDGE = "#ef4444";

/** Pages the BFS never reached from home — visually recede (that IS the finding). */
export const LINK_UNREACHED_COLOR = "#cbd5e1"; // slate-300

/** Depth ramp: kg tier ramp for 0-4, darker slate for 5+, pale for unreached. */
export function depthColor(depth: number | null): string {
  if (depth === null) return LINK_UNREACHED_COLOR;
  if (depth >= KG_TIER_PALETTE.length - 1) return "#64748b"; // slate-500
  return KG_TIER_PALETTE[depth];
}

export const LINK_DEPTH_LABELS = [
  "Home",
  "1 click",
  "2 clicks",
  "3 clicks",
  "4 clicks",
  "5+ clicks",
];

const NODE_MIN_SIZE = 16;
const NODE_MAX_SIZE = 56;

/** Node color for the active mode. */
export function nodeColor(node: LinkGraphNode, mode: LinkColorMode): string {
  if (node.external) return LINK_EXTERNAL_COLOR;
  if (mode === "status") return LINK_STATUS_COLORS[node.status];
  return depthColor(node.depth);
}

/** Node size scaled by inbound links (sqrt so hubs don't swallow the canvas). */
export function nodeSize(inlinks: number, maxInlinks: number): number {
  if (maxInlinks <= 0) return NODE_MIN_SIZE;
  const t = Math.sqrt(inlinks) / Math.sqrt(maxInlinks);
  return NODE_MIN_SIZE + t * (NODE_MAX_SIZE - NODE_MIN_SIZE);
}

/** Directed stylesheet: kg-graph base + link-graph edge/node overrides. */
export function buildLinkGraphStylesheet(
  mode: ThemeMode,
): cytoscape.StylesheetJsonBlock[] {
  const chrome = kgChrome(mode);

  const edge: cytoscape.Css.Edge = {
    // Links are directed — arrows need bezier/straight, not haystack.
    "curve-style": "straight",
    "target-arrow-shape": "triangle",
    "target-arrow-color": chrome.edge,
    "arrow-scale": 0.75,
    "line-color": chrome.edge,
    width: (e: cytoscape.EdgeSingular) => {
      const w = Number(e.data("weight")) || 1;
      return Math.min(0.6 + Math.log2(w) * 0.7, 3.5);
    },
    opacity: 0.28,
  };

  const edgeHighlight: cytoscape.Css.Edge = {
    "line-color": chrome.edgeSelected,
    "target-arrow-color": chrome.edgeSelected,
    opacity: 0.9,
  };

  return [
    ...buildStylesheet(chrome),
    { selector: "edge", style: edge },
    {
      selector: "edge[?nofollow]",
      style: { "line-style": "dashed" } satisfies cytoscape.Css.Edge,
    },
    {
      selector: "edge[?broken]",
      style: {
        "line-color": LINK_BROKEN_EDGE,
        "target-arrow-color": LINK_BROKEN_EDGE,
        opacity: 0.55,
      } satisfies cytoscape.Css.Edge,
    },
    // Class overrides re-declared AFTER the edge override so highlight also
    // recolors the arrowhead (base sheet doesn't know about arrows).
    { selector: `edge.${KG_CLASS.highlight}`, style: edgeHighlight },
    { selector: "edge:selected", style: edgeHighlight },
    {
      selector: "node[?external]",
      style: { shape: "diamond" } satisfies cytoscape.Css.Node,
    },
    {
      selector: "node[?isRoot]",
      style: {
        "border-width": 3,
        "border-color": chrome.selectedRing,
        "border-opacity": 0.9,
      } satisfies cytoscape.Css.Node,
    },
  ];
}
