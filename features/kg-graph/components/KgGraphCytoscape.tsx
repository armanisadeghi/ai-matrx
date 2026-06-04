// features/kg-graph/components/KgGraphCytoscape.tsx
//
// The actual cytoscape render surface. Imports `cytoscape` / `react-cytoscapejs`
// / `cytoscape-fcose` at module top, all of which touch `window`/DOM — so this
// module is ONLY ever loaded through `next/dynamic({ ssr: false })` from
// KgGraphCanvas. Never import it directly in a Server Component or page.
//
// Pure presentation: it receives already-fetched nodes/edges + a kind→visible
// set + an onNodeClick callback. Layout = FCOSE (organic force-directed, stable
// for KG sprawl). React Compiler is on, so no manual memo of handlers.

"use client";

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import fcose, { type FcoseLayoutOptions } from "cytoscape-fcose";
import CytoscapeComponent from "react-cytoscapejs";

import { useAppSelector } from "@/lib/redux/hooks";

import type { GraphEdge, GraphNode } from "../types";
import {
  KG_NODE_MAX_SIZE,
  KG_NODE_MIN_SIZE,
  colorForKind,
  kgChrome,
  type KgChromeTheme,
} from "../constants";

// Register the FCOSE layout extension exactly once per module load.
let _fcoseRegistered = false;
function ensureFcose(): void {
  if (_fcoseRegistered) return;
  cytoscape.use(fcose);
  _fcoseRegistered = true;
}

export interface KgGraphCytoscapeProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Selected node id (highlighted), or null. */
  selectedId: string | null;
  onNodeClick: (node: GraphNode) => void;
  /** Bumping this triggers a fit-to-viewport (wired to the toolbar "Fit" btn). */
  fitSignal: number;
}

// Map a node's connectivity/mentions to a render size. Degree dominates today
// (mentions are 0 until NER backfill), but mentions take over once populated.
function nodeSize(n: GraphNode, degree: number): number {
  const signal = Math.max(degree, n.mention_count);
  // log scale so a degree-97 hub doesn't dwarf everything.
  const scaled = Math.log2(signal + 1) / Math.log2(100);
  const size = KG_NODE_MIN_SIZE + scaled * (KG_NODE_MAX_SIZE - KG_NODE_MIN_SIZE);
  return Math.round(Math.min(Math.max(size, KG_NODE_MIN_SIZE), KG_NODE_MAX_SIZE));
}

// Build the full stylesheet for a given theme. Hoisted to module scope so the
// exact same builder is used both for the initial mount AND for a live re-apply
// on theme toggle (`cy.style().fromJson(...).update()`), which re-skins the graph
// without re-running layout — node positions are preserved.
//
// @types/cytoscape models style values as `Type | MapperFunction` but NOT the
// string-mapper syntax (`"data(...)"`), so per-element values are fed via typed
// MapperFunctions — which ARE in the type — keeping each block assignable to
// Css.Node / Css.Edge without coercion.
function buildStylesheet(
  chrome: KgChromeTheme,
): cytoscape.StylesheetJsonBlock[] {
  const nodeStyle: cytoscape.Css.Node = {
    "background-color": (n: cytoscape.NodeSingular) => String(n.data("color")),
    width: (n: cytoscape.NodeSingular) => Number(n.data("size")),
    height: (n: cytoscape.NodeSingular) => Number(n.data("size")),
    label: (n: cytoscape.NodeSingular) => String(n.data("label")),
    "font-size": 9,
    "font-weight": 500,
    color: chrome.label,
    // The halo: a contrasting outline traced around the glyphs so the label
    // stays legible over a node, a dense edge mat, or the bare canvas — in
    // either theme. This is the single biggest legibility win.
    "text-outline-width": 2,
    "text-outline-color": chrome.labelHalo,
    "text-outline-opacity": 1,
    "text-valign": "bottom",
    "text-halign": "center",
    "text-margin-y": 4,
    "text-max-width": "120px",
    "text-wrap": "ellipsis",
    "min-zoomed-font-size": 8,
    // A hair of border lifts the node off the canvas without a heavy ring.
    "border-width": 1.5,
    "border-color": chrome.nodeBorder,
    "border-opacity": 0.55,
  };
  const nodeSelectedStyle: cytoscape.Css.Node = {
    "border-width": 3,
    "border-color": chrome.selectedRing,
    "border-opacity": 1,
    color: chrome.labelSelected,
    "font-weight": "bold",
    "z-index": 10,
  };
  const edgeStyle: cytoscape.Css.Edge = {
    width: (e: cytoscape.EdgeSingular) => {
      const w = Number(e.data("weight")) || 1;
      return Math.min(Math.max(0.5 + (w / 10) * 2.5, 0.5), 3);
    },
    "line-color": chrome.edge,
    "curve-style": "haystack",
    "haystack-radius": 0,
    opacity: 0.5,
  };
  const edgeSelectedStyle: cytoscape.Css.Edge = {
    "line-color": chrome.edgeSelected,
    opacity: 0.9,
    "z-index": 9,
  };
  return [
    { selector: "node", style: nodeStyle },
    { selector: "node:selected", style: nodeSelectedStyle },
    { selector: "edge", style: edgeStyle },
    { selector: "edge:selected", style: edgeSelectedStyle },
  ];
}

export default function KgGraphCytoscape({
  nodes,
  edges,
  selectedId,
  onNodeClick,
  fitSignal,
}: KgGraphCytoscapeProps) {
  ensureFcose();
  const cyRef = useRef<cytoscape.Core | null>(null);

  // Cytoscape's stylesheet lives outside the Tailwind/React tree, so it can't
  // read CSS vars — resolve the active theme here and feed raw values in. The
  // selector returns "light" | "dark"; the same source ThemeSwitcher writes.
  const mode = useAppSelector((s) => s.theme.mode);
  const chrome = kgChrome(mode);

  // Precompute degree per node id for sizing.
  const degree: Record<string, number> = {};
  for (const e of edges) {
    degree[e.source] = (degree[e.source] ?? 0) + 1;
    degree[e.target] = (degree[e.target] ?? 0) + 1;
  }

  const elements = [
    ...nodes.map((n) => ({
      data: {
        id: n.id,
        label: n.name,
        kind: n.kind,
        color: colorForKind(n.kind),
        size: nodeSize(n, degree[n.id] ?? 0),
      },
    })),
    ...edges.map((e) => ({
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        weight: e.weight ?? 1,
      },
    })),
  ];

  const stylesheet = buildStylesheet(chrome);

  // Wire the cy instance once it exists: node tap → callback, layout run.
  const handleCy = (cy: cytoscape.Core) => {
    if (cyRef.current === cy) return;
    cyRef.current = cy;
    cy.removeAllListeners();
    cy.on("tap", "node", (evt) => {
      const id = evt.target.id() as string;
      const found = nodes.find((n) => n.id === id);
      if (found) onNodeClick(found);
    });
  };

  // Re-run layout whenever the element set changes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const fcoseOptions: FcoseLayoutOptions = {
      name: "fcose",
      animate: false,
      fit: true,
      padding: 30,
      nodeRepulsion: 8000,
      idealEdgeLength: 80,
      quality: "default",
      randomize: true,
      // Reserve space for each node's label so labels don't pile on top of
      // neighbouring nodes — the crowding the bare layout produced.
      nodeDimensionsIncludeLabels: true,
    };
    const layout = cy.layout(fcoseOptions);
    layout.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, edges.length]);

  // Re-skin live when the theme flips. `fromJson(...).update()` swaps the
  // stylesheet in place — no re-layout, so node positions are preserved.
  useEffect(() => {
    cyRef.current?.style().fromJson(buildStylesheet(kgChrome(mode))).update();
  }, [mode]);

  // Keep cytoscape's selection in sync with the side-panel selection.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().unselect();
    if (selectedId) {
      const el = cy.getElementById(selectedId);
      if (el && el.length) el.select();
    }
  }, [selectedId]);

  // Toolbar "Fit" button bumps fitSignal.
  useEffect(() => {
    cyRef.current?.fit(undefined, 40);
  }, [fitSignal]);

  return (
    <CytoscapeComponent
      elements={elements}
      stylesheet={stylesheet}
      cy={handleCy}
      style={{ width: "100%", height: "100%" }}
      minZoom={0.05}
      maxZoom={3}
      wheelSensitivity={0.2}
    />
  );
}
