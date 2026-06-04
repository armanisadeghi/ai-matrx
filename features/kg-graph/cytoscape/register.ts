// features/kg-graph/cytoscape/register.ts
//
// The ONE place `cytoscape.use(...)` is called. cytoscape throws if the same
// extension is registered twice, and Next.js Fast Refresh / Turbopack re-evaluate
// modules on hot reload — so a plain module-level boolean isn't enough (it resets
// on re-eval). We pin the guard to `globalThis` (truly once per process) and
// belt-and-suspenders swallow only the "already registered" throw.
//
// CLIENT-ONLY: every extension here touches `window`/DOM at import. This module
// must only be reached through the `next/dynamic({ ssr:false })` boundary that
// loads the cytoscape surface — never from a Server Component.

import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import cola from "cytoscape-cola";
import layoutUtilities from "cytoscape-layout-utilities";
// aliased so it doesn't shadow the global `navigator`.
import cyNavigator from "cytoscape-navigator";
// Minimap chrome — base plugin CSS first, then our docked/themed override.
import "cytoscape-navigator/cytoscape.js-navigator.css";
import "./minimap.css";

const FLAG = "__matrx_kg_cytoscape_registered__";

declare global {
  var __matrx_kg_cytoscape_registered__: boolean | undefined;
}

export function registerKgCytoscapeExtensions(): void {
  if (globalThis[FLAG]) return;

  // Named `addExt` (not `use`) so the react-hooks linter doesn't mistake the
  // bare `use(...)` calls for React's `use()` hook.
  const addExt = (ext: cytoscape.Ext): void => {
    try {
      cytoscape.use(ext);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Duplicate-registration under HMR is expected and harmless; re-throw
      // anything else so a real failure isn't silently swallowed.
      if (!/already (been )?registered|already exists/i.test(msg)) throw err;
    }
  };

  addExt(fcose); // organic force layout (default)
  addExt(cola); // interactive / live-resettle layout
  addExt(layoutUtilities); // makes fcose `packComponents` actually pack
  addExt(cyNavigator); // minimap

  globalThis[FLAG] = true;
}
