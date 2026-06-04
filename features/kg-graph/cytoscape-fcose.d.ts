// Ambient declarations for cytoscape-fcose — the package ships no types and
// there is no @types/cytoscape-fcose.
//
//  - the default export is the extension registrant passed to `cytoscape.use`.
//  - `FcoseLayoutOptions` is the concrete option shape we feed `cy.layout()`.
//    It extends cytoscape's `BaseLayoutOptions`, so a value of this type is a
//    valid `LayoutOptions` member at the call site without any coercion.
declare module "cytoscape-fcose" {
  import type cytoscape from "cytoscape";
  const fcose: cytoscape.Ext;
  export default fcose;

  // Option shape verified against the cytoscape-fcose README (v2.2.0). Force
  // params (`nodeRepulsion` / `idealEdgeLength` / `edgeElasticity`) accept either
  // a constant or a per-element function — fcose coerces a bare number, which is
  // how this codebase feeds them.
  export interface FcoseLayoutOptions extends cytoscape.BaseLayoutOptions {
    name: "fcose";
    quality?: "draft" | "default" | "proof";
    randomize?: boolean;
    animate?: boolean;
    animationDuration?: number;
    fit?: boolean;
    padding?: number;
    /** Reserve label-sized boxes so labels don't overlap neighbours (honored at quality:"proof"). */
    nodeDimensionsIncludeLabels?: boolean;
    uniformNodeDimensions?: boolean;
    /** Pack disconnected components tightly. No-op unless cytoscape-layout-utilities is registered + initialized. */
    packComponents?: boolean;
    nodeSeparation?: number;
    nodeRepulsion?: number | ((node: cytoscape.NodeSingular) => number);
    idealEdgeLength?: number | ((edge: cytoscape.EdgeSingular) => number);
    edgeElasticity?: number | ((edge: cytoscape.EdgeSingular) => number);
    nestingFactor?: number;
    numIter?: number;
    tile?: boolean;
    tilingPaddingVertical?: number;
    tilingPaddingHorizontal?: number;
    gravity?: number;
    gravityRange?: number;
    gravityCompound?: number;
    gravityRangeCompound?: number;
    /** Cooling factor when refining existing positions (randomize:false). Lower = gentler nudge. */
    initialEnergyOnIncremental?: number;
  }
}
