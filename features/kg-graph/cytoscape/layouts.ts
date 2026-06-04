// features/kg-graph/cytoscape/layouts.ts
//
// Layout presets for the KG canvas. fcose is the default (organic, scales to
// thousands, packs disconnected components tightly). cola gives a live
// drag-to-resettle feel; concentric ranks by computed importance; grid is a
// plain fallback. Force params are passed as numbers (fcose coerces them).
//
// NOTE: fcose `packComponents` is a silent no-op unless `cytoscape-layout-utilities`
// is registered AND `cy.layoutUtilities(...)` was called on the instance — the
// hook does that init. Without it, disconnected clusters scatter across empty
// canvas (the original bug).

import type cytoscape from "cytoscape";
import type { FcoseLayoutOptions } from "cytoscape-fcose";
import type { ColaLayoutOptions } from "cytoscape-cola";

export type KgLayoutId = "fcose" | "cola" | "concentric" | "grid";

export interface KgLayoutMeta {
  id: KgLayoutId;
  label: string;
  description: string;
}

// Order = display order in the switcher.
export const KG_LAYOUTS: KgLayoutMeta[] = [
  {
    id: "fcose",
    label: "Force (organic)",
    description: "Balanced organic layout. Best default for exploring clusters.",
  },
  {
    id: "cola",
    label: "Force (live)",
    description: "Physics keeps running — drag a node and the graph resettles.",
  },
  {
    id: "concentric",
    label: "By importance",
    description: "Rings by centrality — the most-connected hubs sit at the centre.",
  },
  {
    id: "grid",
    label: "Grid",
    description: "Plain grid. Fast, deterministic, ignores structure.",
  },
];

const fcoseLayout = (animate: boolean): FcoseLayoutOptions => ({
  name: "fcose",
  quality: "default",
  randomize: true,
  animate,
  animationDuration: 600,
  fit: true,
  padding: 40,
  nodeDimensionsIncludeLabels: true,
  uniformNodeDimensions: false,
  packComponents: true, // pack disconnected components (needs layoutUtilities init)
  nodeSeparation: 80,
  nodeRepulsion: 9000,
  idealEdgeLength: 90,
  edgeElasticity: 0.45,
  gravity: 0.25,
  gravityRange: 3.8,
  numIter: 1500,
  tile: true,
  tilingPaddingVertical: 12,
  tilingPaddingHorizontal: 12,
});

const colaLayout = (animate: boolean): ColaLayoutOptions => ({
  name: "cola",
  animate,
  fit: true,
  padding: 40,
  randomize: false, // refine current positions for a smooth resettle
  avoidOverlap: true,
  handleDisconnected: true,
  maxSimulationTime: 2000,
  convergenceThreshold: 0.01,
  ungrabifyWhileSimulating: false, // keep nodes draggable during simulation
  nodeSpacing: 12,
  edgeLength: 100,
  infinite: false,
});

const concentricLayout = (animate: boolean): cytoscape.ConcentricLayoutOptions => ({
  name: "concentric",
  animate,
  animationDuration: 600,
  fit: true,
  padding: 40,
  minNodeSpacing: 24,
  // Higher = closer to the centre. Importance is 0..1 (set by analysis).
  concentric: (node: cytoscape.NodeSingular) =>
    Math.round((Number(node.data("importance")) || 0) * 100),
  levelWidth: () => 8,
});

const gridLayout = (animate: boolean): cytoscape.GridLayoutOptions => ({
  name: "grid",
  animate,
  fit: true,
  padding: 40,
  avoidOverlap: true,
});

/** Build the cytoscape layout options for a preset. `animate=false` on the very
 *  first run (snap into place); animated thereafter for smooth re-layouts. */
export function buildLayout(
  id: KgLayoutId,
  animate: boolean,
): cytoscape.LayoutOptions {
  switch (id) {
    case "cola":
      return colaLayout(animate);
    case "concentric":
      return concentricLayout(animate);
    case "grid":
      return gridLayout(animate);
    case "fcose":
    default:
      return fcoseLayout(animate);
  }
}
