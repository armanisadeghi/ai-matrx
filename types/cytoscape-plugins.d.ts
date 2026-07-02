// cytoscape-cola and cytoscape-layout-utilities ship no type definitions and
// have no @types packages. Both follow the standard cytoscape extension
// contract: a registration function passed to cytoscape.use(). Typed to that
// contract (cytoscape.Ext) rather than `any` so misuse still errors.
declare module "cytoscape-cola" {
  import type { Ext } from "cytoscape";
  const cola: Ext;
  export default cola;
}

declare module "cytoscape-layout-utilities" {
  import type { Ext } from "cytoscape";
  const layoutUtilities: Ext;
  export default layoutUtilities;
}
