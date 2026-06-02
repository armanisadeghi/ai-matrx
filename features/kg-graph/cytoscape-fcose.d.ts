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

  export interface FcoseLayoutOptions extends cytoscape.BaseLayoutOptions {
    name: "fcose";
    quality?: "draft" | "default" | "proof";
    randomize?: boolean;
    animate?: boolean;
    fit?: boolean;
    padding?: number;
    nodeRepulsion?: number;
    idealEdgeLength?: number;
  }
}
