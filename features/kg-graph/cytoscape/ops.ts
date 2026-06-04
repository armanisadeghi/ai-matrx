// features/kg-graph/cytoscape/ops.ts
//
// Imperative operations against a live cytoscape instance. Each is isolated so a
// change to one input (data / theme / encoding / selection / search / camera)
// never triggers the others. The component drives these from thin effects; the
// hook drives focus from event handlers. Layouts run OUTSIDE cy.batch (batch
// can't run a layout); multi-element class changes run INSIDE batch (one redraw).

import type cytoscape from "cytoscape";

import type { GraphEdge, GraphNode } from "../types";
import type { KgChromeTheme } from "../constants";
import {
  annotateGraph,
  applyEncoding,
  buildElements,
  type GraphAnalysis,
  type KgColorBy,
  type KgSizeBy,
} from "./analysis";
import { buildStylesheet, KG_CLASS } from "./style";
import { buildLayout, type KgLayoutId } from "./layouts";

const FOCUS_CLASSES = `${KG_CLASS.faded} ${KG_CLASS.focus} ${KG_CLASS.highlight}`;
const SEARCH_CLASSES = `${KG_CLASS.faded} ${KG_CLASS.searchHit} ${KG_CLASS.highlight}`;

export interface LoadGraphConfig {
  colorBy: KgColorBy;
  sizeBy: KgSizeBy;
  layoutId: KgLayoutId;
  animate: boolean;
}

/** Replace the graph: swap elements, compute importance + communities, apply the
 *  current encoding, then run the chosen layout. Returns the analysis summary. */
export function loadGraph(
  cy: cytoscape.Core,
  nodes: GraphNode[],
  edges: GraphEdge[],
  cfg: LoadGraphConfig,
): GraphAnalysis {
  cy.stop(); // halt any in-flight layout/animation
  cy.batch(() => {
    cy.elements().remove();
    cy.add(buildElements(nodes, edges));
  });
  const analysis = annotateGraph(cy);
  applyEncoding(cy, cfg.colorBy, cfg.sizeBy);
  cy.layout(buildLayout(cfg.layoutId, cfg.animate)).run();
  return analysis;
}

/** Swap the stylesheet for a theme — no re-layout, positions preserved. */
export function applyTheme(cy: cytoscape.Core, chrome: KgChromeTheme): void {
  cy.style().fromJson(buildStylesheet(chrome)).update();
}

/** Re-run a layout preset (used when the user switches layout). */
export function runLayout(
  cy: cytoscape.Core,
  layoutId: KgLayoutId,
  animate: boolean,
): void {
  cy.stop();
  cy.layout(buildLayout(layoutId, animate)).run();
}

/** Highlight a node's closed neighbourhood, fade the rest. */
export function focusNeighborhood(cy: cytoscape.Core, id: string): void {
  const node = cy.getElementById(id);
  if (node.empty()) return;
  const hood = node.closedNeighborhood();
  cy.batch(() => {
    cy.elements().addClass(KG_CLASS.faded);
    hood.removeClass(KG_CLASS.faded);
    hood.edges().addClass(KG_CLASS.highlight);
    node.addClass(KG_CLASS.focus);
  });
}

export function clearFocus(cy: cytoscape.Core): void {
  cy.batch(() => cy.elements().removeClass(FOCUS_CLASSES));
}

/** Fade everything except nodes whose label matches `query` (and their
 *  neighbours). Empty query clears the search highlight. */
export function applySearch(cy: cytoscape.Core, query: string): void {
  const q = query.trim().toLowerCase();
  cy.batch(() => {
    cy.elements().removeClass(SEARCH_CLASSES);
    if (!q) return;
    const matches = cy
      .nodes()
      .filter((n) => String(n.data("label")).toLowerCase().includes(q));
    if (matches.empty()) return;
    const keep = matches.closedNeighborhood();
    cy.elements().addClass(KG_CLASS.faded);
    keep.removeClass(KG_CLASS.faded);
    keep.edges().addClass(KG_CLASS.highlight);
    matches.addClass(KG_CLASS.searchHit);
  });
}

const EASE = "ease-in-out-cubic";

/** Animated fit to the whole graph. */
export function fitAll(cy: cytoscape.Core, padding = 40): void {
  if (cy.elements().empty()) return;
  cy.animate({ fit: { eles: cy.elements(), padding } }, { duration: 400, easing: EASE });
}

/** Animated fit to a collection (e.g. a double-clicked node's neighbourhood). */
export function fitTo(
  cy: cytoscape.Core,
  eles: cytoscape.CollectionReturnValue,
  padding = 60,
): void {
  if (eles.empty()) return;
  cy.animate({ fit: { eles, padding } }, { duration: 400, easing: EASE });
}

/** Animated zoom about the viewport centre. */
export function zoomByFactor(cy: cytoscape.Core, factor: number): void {
  const next = Math.min(Math.max(cy.zoom() * factor, cy.minZoom()), cy.maxZoom());
  cy.animate(
    {
      zoom: {
        level: next,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      },
    },
    { duration: 150, easing: EASE },
  );
}
