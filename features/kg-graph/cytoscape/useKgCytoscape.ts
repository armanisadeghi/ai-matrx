// features/kg-graph/cytoscape/useKgCytoscape.ts
//
// Owns the cytoscape instance LIFECYCLE only: create once, register extensions,
// init layout-utilities (so fcose packComponents actually packs) + the minimap,
// bind events once (reading the latest callbacks through a ref so handlers never
// go stale under React Compiler), observe container resize, and destroy on
// unmount — which is what makes React 19 StrictMode + Turbopack HMR leak-free.
//
// Data / theme / encoding / layout / selection / search are NOT here — the
// component drives those through `ops` from thin effects keyed on each input.

"use client";

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";

import { registerKgCytoscapeExtensions } from "./register";
import { clearFocus, focusNeighborhood, fitTo } from "./ops";

export interface UseKgCytoscapeArgs {
  /** CSS selector ("#id") of the minimap container div. */
  minimapSelector: string;
  /** Stylesheet to create the instance with (read once, at mount). */
  initialStyle: cytoscape.StylesheetJson;
  /** Currently pinned node id (the side-panel selection), or null. Hover preview
   *  is suppressed while something is pinned so the pin doesn't flicker. */
  selectedId: string | null;
  /** Tap a node → open its side panel (which pins the focus). */
  onNodeTap: (id: string) => void;
  /** Tap the empty canvas → clear selection. */
  onBackgroundTap: () => void;
}

export interface KgController {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Live instance, or null before mount / after unmount. */
  getCy: () => cytoscape.Core | null;
}

export function useKgCytoscape(args: UseKgCytoscapeArgs): KgController {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  // Latest args via a ref: bind cy.on() ONCE but always call the freshest
  // callbacks. The React-Compiler-correct alternative to memoizing handlers.
  // Written in an effect (never during render) per the hooks rules.
  const cb = useRef(args);
  useEffect(() => {
    cb.current = args;
  });

  useEffect(() => {
    registerKgCytoscapeExtensions();

    const container = containerRef.current;
    if (!container) return;

    // Defensive: tear down any instance still bound to this container.
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    const cy = cytoscape({
      container,
      style: cb.current.initialStyle,
      minZoom: 0.05,
      maxZoom: 3,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: true, // shift-drag rubber-band selects a region…
      selectionType: "additive", // …and Ctrl/Cmd-click adds individual nodes.
      // A plain tap is normalized back to single-select in the tap handler.
      // Either way, dragging any selected node moves the whole selected set
      // (native group-drag) — the "move a section all at once" behaviour.
      pixelRatio: "auto",
    });
    cyRef.current = cy;

    // Make fcose `packComponents` effective — packs disconnected components into
    // the viewport instead of scattering them across empty canvas.
    try {
      cy.layoutUtilities({ desiredAspectRatio: cy.width() / cy.height() || 1.6 });
    } catch {
      // extension missing → fcose silently falls back; not fatal.
    }

    // Minimap. navigator overwrites the container className (styled via minimap.css).
    let nav: { destroy: () => void } | null = null;
    try {
      nav = cy.navigator({
        container: cb.current.minimapSelector,
        viewLiveFramerate: 0,
      });
    } catch {
      nav = null;
    }

    // Events bound once; handlers read cb.current for the latest props.
    // Ctrl/Cmd-click leaves the additive selection alone (multi-select for
    // group-drag); a plain tap opens the side panel, which pins the focus.
    cy.on("tap", "node", (evt) => {
      const oe = evt.originalEvent as MouseEvent | undefined;
      if (oe && (oe.ctrlKey || oe.metaKey)) return;
      cb.current.onNodeTap(evt.target.id());
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) cb.current.onBackgroundTap();
    });
    cy.on("dbltap", "node", (evt) =>
      fitTo(cy, evt.target.closedNeighborhood()),
    );
    cy.on("dbltap", (evt) => {
      if (evt.target === cy)
        cy.animate({ fit: { eles: cy.elements(), padding: 40 } }, { duration: 400 });
    });
    // Hover previews a node's neighbourhood — but NOT while a node is pinned
    // (tracked by selectedId), so a click holds its focus instead of the hover
    // taking over.
    cy.on("mouseover", "node", (evt) => {
      if (cb.current.selectedId) return;
      focusNeighborhood(cy, evt.target.id());
    });
    cy.on("mouseout", "node", () => {
      if (cb.current.selectedId) return;
      clearFocus(cy);
    });

    // Keep the graph sized to its container (panels opening, window resize).
    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (nav) {
        try {
          nav.destroy();
        } catch {
          // navigator already gone with the instance — ignore.
        }
      }
      cy.destroy();
      cyRef.current = null;
    };
    // Create exactly once; all later updates are imperative via ops.
  }, []);

  return { containerRef, getCy: () => cyRef.current };
}
