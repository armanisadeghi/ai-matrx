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

const SECTION_MIN_SIZE = 28;
const SECTION_MAX_SIZE = 96;

/** Section node size by page count — the section view's primary quantity. */
export function sectionSize(pageCount: number, maxPageCount: number): number {
  if (maxPageCount <= 1) return SECTION_MIN_SIZE;
  const t = Math.sqrt(pageCount) / Math.sqrt(maxPageCount);
  return SECTION_MIN_SIZE + t * (SECTION_MAX_SIZE - SECTION_MIN_SIZE);
}

/**
 * Truncate a label for the canvas. Labels are the #1 cause of an unreadable
 * graph — a full URL on every node covers the canvas at any real page count.
 * Node labels are ALWAYS a single path segment; this is the hard backstop.
 */
export function truncateLabel(label: string, max = 18): string {
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

/** Directed stylesheet: kg-graph base + link-graph edge/node overrides. */
export function buildLinkGraphStylesheet(
  mode: ThemeMode,
  /** Hide labels on nodes below this size (page-level view at scale). */
  labelMinSize = 0,
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
    // Label discipline — the difference between a map and a wall of text:
    // wrapped, width-bounded, ellipsized, and centered under the node.
    {
      selector: "node",
      style: {
        "text-wrap": "wrap",
        "text-max-width": "96px",
        "text-valign": "bottom",
        "text-margin-y": 3,
        "font-size": 10,
      } satisfies cytoscape.Css.Node,
    },
    // At scale only the hubs keep a label; everything else reveals its label
    // on hover/selection (the kg engine's highlight classes).
    ...(labelMinSize > 0
      ? [
          {
            selector: `node[size < ${labelMinSize}]`,
            style: { label: "" } satisfies cytoscape.Css.Node,
          },
          {
            selector: `node[size < ${labelMinSize}].${KG_CLASS.highlight}, node[size < ${labelMinSize}]:selected`,
            style: {
              label: "data(label)",
              "z-index": 30,
            } satisfies cytoscape.Css.Node,
          },
        ]
      : []),
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
    // Folders (aggregated sections) read as containers, not pages, and always
    // keep their label — they are the map's legend.
    {
      selector: "node[?isFolder]",
      style: {
        shape: "round-rectangle",
        "border-width": 2,
        "border-color": chrome.selectedRing,
        "border-opacity": 0.35,
        "font-weight": 600,
        "text-max-width": "120px",
        label: "data(label)",
      } satisfies cytoscape.Css.Node,
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
