// features/kg-graph/components/KgGraphCytoscape.tsx
//
// The cytoscape render surface — PRESENTATIONAL. It renders the graph container,
// the minimap, and the on-canvas zoom controls, then wires the app's reactive
// inputs (data / theme / colour + size encoding / layout / selection / search /
// fit) to imperative `ops` through thin effects. All cytoscape lifecycle lives in
// `useKgCytoscape`; all algorithms in `cytoscape/*`.
//
// CLIENT-ONLY: imports cytoscape + extensions (which touch `window` at load), so
// it is ONLY ever reached through `next/dynamic({ ssr:false })` in KgGraphCanvas.
// Never import it directly from a Server Component or page.

"use client";

import { useEffect, useId, useRef } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";

import type { GraphEdge, GraphNode } from "../types";
import { kgChrome } from "../constants";
import { buildStylesheet } from "../cytoscape/style";
import { useKgCytoscape } from "../cytoscape/useKgCytoscape";
import {
  applyTheme,
  fitAll,
  loadGraph,
  runLayout,
  selectNode,
  applySearch,
  zoomByFactor,
} from "../cytoscape/ops";
import { applyEncoding, type KgColorBy, type KgSizeBy } from "../cytoscape/analysis";
import type { KgLayoutId } from "../cytoscape/layouts";

export interface KgGraphCytoscapeProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Selected node id (mirrored onto cytoscape selection), or null. */
  selectedId: string | null;
  onNodeClick: (node: GraphNode) => void;
  /** Tapping the empty canvas clears the side-panel selection. */
  onBackgroundClick: () => void;
  layoutId: KgLayoutId;
  colorBy: KgColorBy;
  sizeBy: KgSizeBy;
  /** Live search query — matches are accented, the rest fade. */
  searchQuery: string;
  /** Reports analysis results (e.g. detected community count) after each load. */
  onAnalysis?: (result: { communityCount: number }) => void;
}

const CONTROL_BTN =
  "flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent hover:text-foreground";

export default function KgGraphCytoscape({
  nodes,
  edges,
  selectedId,
  onNodeClick,
  onBackgroundClick,
  layoutId,
  colorBy,
  sizeBy,
  searchQuery,
  onAnalysis,
}: KgGraphCytoscapeProps) {
  const mode = useAppSelector((s) => s.theme.mode);
  const chrome = kgChrome(mode);

  // navigator wants a string selector; useId is unique but its colons aren't
  // valid in a `#id` selector, so strip them.
  const minimapId = `kg-mm-${useId().replace(/:/g, "")}`;

  // Latest encoding/layout for loadGraph (which runs from the data effect).
  // Written in an effect (not during render) per the React-Compiler hooks rules.
  const cfg = useRef({ colorBy, sizeBy, layoutId });
  useEffect(() => {
    cfg.current = { colorBy, sizeBy, layoutId };
  });

  const { containerRef, getCy } = useKgCytoscape({
    minimapSelector: `#${minimapId}`,
    initialStyle: buildStylesheet(chrome),
    onNodeTap: (id) => {
      const found = nodes.find((n) => n.id === id);
      if (found) onNodeClick(found);
    },
    onBackgroundTap: onBackgroundClick,
  });

  // DATA → rebuild graph + recompute analysis + run current layout. Snap into
  // place on the first load, animate subsequent reloads.
  const firstData = useRef(true);
  useEffect(() => {
    const cy = getCy();
    if (!cy) return;
    const analysis = loadGraph(cy, nodes, edges, {
      ...cfg.current,
      animate: !firstData.current,
    });
    firstData.current = false;
    onAnalysis?.(analysis);  }, [nodes, edges]);

  // THEME → swap stylesheet in place (no re-layout).
  useEffect(() => {
    const cy = getCy();
    if (cy) applyTheme(cy, chrome);  }, [mode]);

  // ENCODING → repoint colour/size (cheap; no layout). Idempotent on mount.
  useEffect(() => {
    const cy = getCy();
    if (cy) applyEncoding(cy, colorBy, sizeBy);  }, [colorBy, sizeBy]);

  // LAYOUT → re-run on switch (skip the mount run; the data effect already laid out).
  const layoutMounted = useRef(false);
  useEffect(() => {
    const cy = getCy();
    if (!cy) return;
    if (!layoutMounted.current) {
      layoutMounted.current = true;
      return;
    }
    runLayout(cy, layoutId, true);  }, [layoutId]);

  // SELECTION → mirror the side-panel selection onto cytoscape.
  useEffect(() => {
    const cy = getCy();
    if (cy) selectNode(cy, selectedId);  }, [selectedId]);

  // SEARCH → accent matches, fade the rest.
  useEffect(() => {
    const cy = getCy();
    if (cy) applySearch(cy, searchQuery);  }, [searchQuery]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* On-canvas zoom controls (bottom-left). Pan/zoom is native; these are chrome. */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1">
        <button
          type="button"
          className={CONTROL_BTN}
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => {
            const cy = getCy();
            if (cy) zoomByFactor(cy, 1.3);
          }}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={CONTROL_BTN}
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => {
            const cy = getCy();
            if (cy) zoomByFactor(cy, 0.7);
          }}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={CONTROL_BTN}
          title="Fit to view"
          aria-label="Fit to view"
          onClick={() => {
            const cy = getCy();
            if (cy) fitAll(cy);
          }}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Minimap container — navigator renders into this (styled in minimap.css).
          We set the plugin's own class in JSX too: the plugin assigns
          `className = "cytoscape-navigator"` imperatively, and without it in the
          JSX React would reset className to "" on the next re-render and wipe the
          minimap chrome. Matching values means React and the plugin never fight. */}
      <div id={minimapId} className="cytoscape-navigator" />
    </div>
  );
}
