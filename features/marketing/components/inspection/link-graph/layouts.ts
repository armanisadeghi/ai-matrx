// features/marketing/components/inspection/link-graph/layouts.ts
//
// Layout presets for the site link graph. Reuses kg-graph's fcose/concentric/
// grid builders and adds the two site-structure layouts every serious crawl
// visualizer offers (Screaming Frog / Sitebulb): a breadth-first TREE and a
// RADIAL map, both rooted at the homepage — click depth reads directly as
// distance from the root.

import type cytoscape from "cytoscape";

import {
  buildLayout as buildKgLayout,
  type KgLayoutId,
} from "@/features/kg-graph/cytoscape/layouts";

export type LinkLayoutId = "fcose" | "radial" | "tree" | "concentric" | "grid";

export interface LinkLayoutMeta {
  id: LinkLayoutId;
  label: string;
  description: string;
}

export const LINK_LAYOUTS: LinkLayoutMeta[] = [
  {
    id: "fcose",
    label: "Force (organic)",
    description: "Organic clusters — pages that interlink pull together.",
  },
  {
    id: "radial",
    label: "Site map (radial)",
    description: "Rings around the homepage — distance = click depth.",
  },
  {
    id: "tree",
    label: "Site map (tree)",
    description: "Top-down hierarchy from the homepage.",
  },
  {
    id: "concentric",
    label: "By inlinks",
    description: "Most-linked pages at the centre.",
  },
  {
    id: "grid",
    label: "Grid",
    description: "Plain grid. Fast, deterministic, ignores structure.",
  },
];

function breadthfirst(
  circle: boolean,
  animate: boolean,
  rootId: string | null,
): cytoscape.BreadthFirstLayoutOptions {
  return {
    name: "breadthfirst",
    circle,
    animate,
    animationDuration: 600,
    fit: true,
    padding: 40,
    directed: true,
    spacingFactor: circle ? 1.1 : 1.3,
    avoidOverlap: true,
    grid: !circle,
    ...(rootId ? { roots: [rootId] } : {}),
  };
}

/**
 * Build cytoscape layout options for a preset. `rootId` anchors the hierarchy
 * layouts at the homepage (they fall back to cytoscape's own root pick when
 * the homepage isn't in the graph).
 */
export function buildLinkLayout(
  id: LinkLayoutId,
  animate: boolean,
  nodeCount: number,
  rootId: string | null,
): cytoscape.LayoutOptions {
  if (id === "radial") return breadthfirst(true, animate, rootId);
  if (id === "tree") return breadthfirst(false, animate, rootId);
  // kg's fcose builder already sets `nodeDimensionsIncludeLabels` (labels are
  // part of a node's footprint), which is what keeps section labels apart.
  return buildKgLayout(id as KgLayoutId, animate, nodeCount);
}
