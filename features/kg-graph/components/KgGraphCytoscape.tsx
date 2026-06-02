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

import type { GraphEdge, GraphNode } from "../types";
import {
  KG_NODE_MAX_SIZE,
  KG_NODE_MIN_SIZE,
  colorForKind,
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

export default function KgGraphCytoscape({
  nodes,
  edges,
  selectedId,
  onNodeClick,
  fitSignal,
}: KgGraphCytoscapeProps) {
  ensureFcose();
  const cyRef = useRef<cytoscape.Core | null>(null);

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

  // @types/cytoscape models style values as `Type | MapperFunction` but NOT the
  // string-mapper syntax (`"data(...)"`), so we feed per-element values via
  // typed MapperFunctions — which ARE in the type — instead of mapper strings.
  // This keeps every block assignable to Css.Node / Css.Edge without coercion.
  const nodeStyle: cytoscape.Css.Node = {
    "background-color": (n: cytoscape.NodeSingular) => String(n.data("color")),
    width: (n: cytoscape.NodeSingular) => Number(n.data("size")),
    height: (n: cytoscape.NodeSingular) => Number(n.data("size")),
    label: (n: cytoscape.NodeSingular) => String(n.data("label")),
    "font-size": 9,
    color: "#94a3b8",
    "text-valign": "bottom",
    "text-halign": "center",
    "text-margin-y": 3,
    "text-max-width": "120px",
    "text-wrap": "ellipsis",
    "min-zoomed-font-size": 8,
    "border-width": 0,
  };
  const nodeSelectedStyle: cytoscape.Css.Node = {
    "border-width": 3,
    "border-color": "#f8fafc",
    color: "#f8fafc",
    "font-weight": "bold",
  };
  const edgeStyle: cytoscape.Css.Edge = {
    width: (e: cytoscape.EdgeSingular) => {
      const w = Number(e.data("weight")) || 1;
      return Math.min(Math.max(0.5 + (w / 10) * 2.5, 0.5), 3);
    },
    "line-color": "#475569",
    "curve-style": "haystack",
    "haystack-radius": 0,
    opacity: 0.5,
  };
  const edgeSelectedStyle: cytoscape.Css.Edge = {
    "line-color": "#94a3b8",
    opacity: 0.9,
  };
  const stylesheet: cytoscape.StylesheetJsonBlock[] = [
    { selector: "node", style: nodeStyle },
    { selector: "node:selected", style: nodeSelectedStyle },
    { selector: "edge", style: edgeStyle },
    { selector: "edge:selected", style: edgeSelectedStyle },
  ];

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
    };
    const layout = cy.layout(fcoseOptions);
    layout.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, edges.length]);

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
