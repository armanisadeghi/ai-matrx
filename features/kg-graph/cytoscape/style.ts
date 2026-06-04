// features/kg-graph/cytoscape/style.ts
//
// The cytoscape stylesheet, built per theme. Kept apart from the React tree
// because cytoscape style takes raw literals only (no CSS vars / Tailwind). The
// theme-dependent chrome (label, halo, edges, selection) comes from `KG_CHROME`;
// per-node hue + size are data-driven (`data(color)` / `data(size)`) so changing
// the colour/size encoding never touches this sheet — only `applyEncoding` rewrites
// element data. Swap themes live with `cy.style().fromJson(buildStylesheet(c)).update()`.

import type cytoscape from "cytoscape";

import type { KgChromeTheme } from "../constants";

// Interaction-state class names, defined once so the stylesheet selectors and the
// imperative ops that toggle them can never drift apart.
export const KG_CLASS = {
  /** Out-of-focus elements during neighbour highlight / search — dimmed. */
  faded: "kg-faded",
  /** The hovered or pinned node at the centre of a neighbour highlight. */
  focus: "kg-focus",
  /** An edge inside the focused neighbourhood. */
  highlight: "kg-highlight",
  /** A node matching the active search query. */
  searchHit: "kg-search-hit",
} as const;

// @types/cytoscape models style values as `Type | MapperFunction` but NOT the
// `"data(...)"` string-mapper, so per-element values are fed via typed
// MapperFunctions — which ARE in the type — keeping blocks assignable to
// Css.Node / Css.Edge without coercion.
export function buildStylesheet(
  chrome: KgChromeTheme,
): cytoscape.StylesheetJsonBlock[] {
  const node: cytoscape.Css.Node = {
    "background-color": (n: cytoscape.NodeSingular) => String(n.data("color")),
    "background-opacity": 1,
    width: (n: cytoscape.NodeSingular) => Number(n.data("size")),
    height: (n: cytoscape.NodeSingular) => Number(n.data("size")),
    shape: "ellipse",
    "border-width": 1.5,
    "border-color": chrome.nodeBorder,
    "border-opacity": 0.55,
    // label
    label: (n: cytoscape.NodeSingular) => String(n.data("label")),
    "font-size": 9,
    "font-weight": 500,
    color: chrome.label,
    // The halo — a contrasting outline around the glyphs so labels stay legible
    // over a node, a dense edge mat, or the bare canvas, in either theme.
    "text-outline-width": 2,
    "text-outline-color": chrome.labelHalo,
    "text-outline-opacity": 1,
    "text-valign": "bottom",
    "text-halign": "center",
    "text-margin-y": 4,
    "text-max-width": "120px",
    "text-wrap": "ellipsis",
    "min-zoomed-font-size": 9, // declutter + perf: drop labels when zoomed far out
    // animate focus/fade transitions smoothly
    "transition-property": "opacity border-color border-width",
    "transition-duration": 0.15,
  };

  const nodeSelected: cytoscape.Css.Node = {
    "border-width": 3,
    "border-color": chrome.selectedRing,
    "border-opacity": 1,
    color: chrome.labelSelected,
    "font-weight": "bold",
    "z-index": 20,
  };

  // mousedown / touch-press affordance
  const nodeActive: cytoscape.Css.Node = {
    "overlay-color": chrome.selectedRing,
    "overlay-opacity": 0.18,
    "overlay-padding": 6,
  };

  // while being dragged — float above the rest
  const nodeGrabbed: cytoscape.Css.Node = {
    "border-color": chrome.selectedRing,
    "z-index": 9999,
  };

  // the focused node in a neighbour highlight — a crisp, non-destructive ring
  const nodeFocus: cytoscape.Css.Node = {
    "border-width": 3,
    "border-color": chrome.selectedRing,
    "border-opacity": 1,
    color: chrome.labelSelected,
    "font-weight": "bold",
    "z-index": 21,
  };

  const nodeSearchHit: cytoscape.Css.Node = {
    "border-width": 3,
    "border-color": chrome.searchHit,
    "border-opacity": 1,
    color: chrome.labelSelected,
    "font-weight": "bold",
    "z-index": 22,
  };

  const faded: cytoscape.Css.Node = {
    opacity: chrome.fadedOpacity,
    "text-opacity": 0,
  };

  // Edges recede by DEFAULT. Today every edge is co-occurrence ("appeared near
  // each other") — noise, not a real relationship — and dense corpora turn into
  // an unreadable hairball. So edges sit at a faint baseline and the SIGNAL is the
  // nodes; a node's actual connections only light up when it's focused/hovered
  // (the `highlight` class below). Raise this only once edges are typed/meaningful.
  const edge: cytoscape.Css.Edge = {
    width: (e: cytoscape.EdgeSingular) => {
      const w = Number(e.data("weight")) || 1;
      return Math.min(Math.max(0.5 + (w / 10) * 2.5, 0.5), 3);
    },
    "line-color": chrome.edge,
    "curve-style": "haystack",
    "haystack-radius": 0,
    opacity: 0.12,
    "transition-property": "opacity line-color",
    "transition-duration": 0.15,
  };

  const edgeSelected: cytoscape.Css.Edge = {
    "line-color": chrome.edgeSelected,
    opacity: 0.9,
    "z-index": 19,
  };

  const edgeHighlight: cytoscape.Css.Edge = {
    "line-color": chrome.edgeSelected,
    opacity: 0.85,
    "z-index": 18,
  };

  const edgeFaded: cytoscape.Css.Edge = {
    opacity: Math.max(chrome.fadedOpacity - 0.04, 0.04),
  };

  return [
    { selector: "node", style: node },
    { selector: "node:selected", style: nodeSelected },
    { selector: "node:active", style: nodeActive },
    { selector: "node:grabbed", style: nodeGrabbed },
    { selector: `node.${KG_CLASS.focus}`, style: nodeFocus },
    { selector: `node.${KG_CLASS.searchHit}`, style: nodeSearchHit },
    { selector: `node.${KG_CLASS.faded}`, style: faded },
    { selector: "edge", style: edge },
    { selector: "edge:selected", style: edgeSelected },
    { selector: `edge.${KG_CLASS.highlight}`, style: edgeHighlight },
    { selector: `edge.${KG_CLASS.faded}`, style: edgeFaded },
  ];
}
