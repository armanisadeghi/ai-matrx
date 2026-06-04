// Ambient declarations for the cytoscape extensions that ship no types of their
// own. `cytoscape-navigator` is intentionally absent — it IS typed via the
// installed `@types/cytoscape-navigator` (which also augments `cytoscape.Core`
// with `navigator()`). Each default export below is the registrant handed to
// `cytoscape.use(...)`.

declare module "cytoscape-cola" {
  import type cytoscape from "cytoscape";
  const cola: cytoscape.Ext;
  export default cola;

  // Subset of the webcola / cytoscape-cola options this codebase uses. Extends
  // `BaseLayoutOptions` so the value is a valid `LayoutOptions` member at the
  // `cy.layout()` call site without coercion.
  export interface ColaLayoutOptions extends cytoscape.BaseLayoutOptions {
    name: "cola";
    animate?: boolean;
    refresh?: number;
    maxSimulationTime?: number;
    ungrabifyWhileSimulating?: boolean;
    fit?: boolean;
    padding?: number;
    randomize?: boolean;
    avoidOverlap?: boolean;
    handleDisconnected?: boolean;
    convergenceThreshold?: number;
    nodeSpacing?: number | ((node: cytoscape.NodeSingular) => number);
    edgeLength?: number | ((edge: cytoscape.EdgeSingular) => number);
    /** Keep simulating forever (live drag-to-resettle). Bounded by default here. */
    infinite?: boolean;
  }
}

declare module "cytoscape-layout-utilities" {
  import type cytoscape from "cytoscape";
  const layoutUtilities: cytoscape.Ext;
  export default layoutUtilities;
}

// `cytoscape-layout-utilities` adds an instance method that fcose's
// `packComponents` reads. Mirror the `@types/cytoscape-navigator` augmentation
// pattern so `cy.layoutUtilities(...)` type-checks.
declare global {
  namespace cytoscape {
    interface Core {
      layoutUtilities(options?: {
        desiredAspectRatio?: number;
        polyominoGridSizeFactor?: number;
        utilityFunction?: number;
        componentSpacing?: number;
      }): unknown;
    }
  }
}

export {};
