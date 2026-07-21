// features/marketing/components/inspection/link-graph/LinkGraphCytoscape.tsx
//
// The cytoscape render surface for the site link graph — PRESENTATIONAL.
// Reuses the kg-graph engine wholesale: instance lifecycle via useKgCytoscape,
// imperative camera/focus/search ops, and the theme chrome. Marketing supplies
// its own element builder (directed, precomputed color/size) and stylesheet.
//
// CLIENT-ONLY: imports cytoscape + extensions (touch `window` at load) — only
// ever reached through `next/dynamic({ ssr: false })` in LinkGraphView. Never
// import directly from a Server Component.

"use client";

import { useEffect, useId, useRef } from "react";
import type cytoscape from "cytoscape";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

import { useThemeMode } from "@/styles/themes/useThemeMode";
import { useKgCytoscape } from "@/features/kg-graph/cytoscape/useKgCytoscape";
import {
  applySearch,
  clearFocus,
  fitAll,
  focusNeighborhood,
  zoomByFactor,
} from "@/features/kg-graph/cytoscape/ops";

import type { LinkGraphEdge, LinkGraphNode } from "./model";
import { buildLinkGraphStylesheet, nodeColor, nodeSize, type LinkColorMode } from "./style";
import { buildLinkLayout, type LinkLayoutId } from "./layouts";

export interface LinkGraphCytoscapeProps {
  nodes: LinkGraphNode[];
  edges: LinkGraphEdge[];
  rootId: string | null;
  colorMode: LinkColorMode;
  layoutId: LinkLayoutId;
  selectedId: string | null;
  searchQuery: string;
  onNodeClick: (id: string) => void;
  onBackgroundClick: () => void;
}

const CONTROL_BTN =
  "flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent hover:text-foreground";

// Run a layout and EXPLICITLY fit when it settles. The layout's own `fit` is
// not trustworthy here: under StrictMode remounts the surviving instance can
// run its layout while the container is 0×0 (observed live), which computes a
// garbage camera (zoom 1 / pan 0,0). Fit explicitly on layoutstop — and if the
// container is still unsized at that moment, defer the fit to the first real
// resize (the lifecycle hook's ResizeObserver calls cy.resize(), which emits
// the "resize" event once the container gets its actual dimensions).
function runLayoutAndFit(
  cy: cytoscape.Core,
  options: cytoscape.LayoutOptions,
): void {
  const layout = cy.layout(options);
  layout.one("layoutstop", () => {
    if (cy.destroyed()) return;
    if (cy.width() === 0 || cy.height() === 0) {
      cy.one("resize", () => {
        if (!cy.destroyed()) cy.fit(cy.elements(), 40);
      });
      return;
    }
    cy.fit(cy.elements(), 40);
  });
  layout.run();
}

function buildElements(
  nodes: LinkGraphNode[],
  edges: LinkGraphEdge[],
  colorMode: LinkColorMode,
): cytoscape.ElementDefinition[] {
  const maxInlinks = nodes.reduce((max, n) => Math.max(max, n.inlinks), 0);
  const nodeElements = nodes.map((node) => ({
    group: "nodes" as const,
    data: {
      id: node.id,
      label: node.label,
      color: nodeColor(node, colorMode),
      size: nodeSize(node.inlinks, maxInlinks),
      external: node.external,
      isRoot: node.isRoot,
      // concentric layout ranks by `importance` (kg engine contract).
      importance: maxInlinks > 0 ? node.inlinks / maxInlinks : 0,
    },
  }));
  const edgeElements = edges.map((edge) => ({
    group: "edges" as const,
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      nofollow: edge.nofollow,
      broken: edge.broken,
    },
  }));
  return [...nodeElements, ...edgeElements];
}

export default function LinkGraphCytoscape({
  nodes,
  edges,
  rootId,
  colorMode,
  layoutId,
  selectedId,
  searchQuery,
  onNodeClick,
  onBackgroundClick,
}: LinkGraphCytoscapeProps) {
  const mode = useThemeMode();

  // navigator wants a "#id" selector; useId's colons aren't valid there.
  const minimapId = `link-mm-${useId().replace(/:/g, "")}`;

  // Latest layout/root for the data effect (written in an effect per hooks rules).
  const cfg = useRef({ layoutId, rootId, colorMode });
  useEffect(() => {
    cfg.current = { layoutId, rootId, colorMode };
  });

  const { containerRef, getCy } = useKgCytoscape({
    minimapSelector: `#${minimapId}`,
    initialStyle: buildLinkGraphStylesheet(mode),
    selectedId,
    onNodeTap: onNodeClick,
    onBackgroundTap: onBackgroundClick,
  });

  // DATA → rebuild elements + run current layout. Always snap (animate=false):
  // a full reload replaces the graph anyway, and an animated layout here can
  // strand a zombie core animation under StrictMode's double effect pass.
  useEffect(() => {
    const cy = getCy();
    if (!cy) return;
    cy.stop(true);
    cy.batch(() => {
      cy.elements().remove();
      cy.add(buildElements(nodes, edges, cfg.current.colorMode));
    });
    runLayoutAndFit(
      cy,
      buildLinkLayout(
        cfg.current.layoutId,
        false,
        nodes.length,
        cfg.current.rootId,
      ),
    );
  }, [nodes, edges]);

  // THEME → swap stylesheet in place (no re-layout).
  useEffect(() => {
    const cy = getCy();
    if (cy) cy.style().fromJson(buildLinkGraphStylesheet(mode)).update();
  }, [mode]);

  // COLOR MODE → repoint node colors without re-layout.
  useEffect(() => {
    const cy = getCy();
    if (!cy) return;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    cy.batch(() => {
      cy.nodes().forEach((el) => {
        const node = byId.get(el.id());
        if (node) el.data("color", nodeColor(node, colorMode));
      });
    });
  }, [colorMode]);

  // LAYOUT → re-run on switch (mount run handled by the data effect). The
  // skip-first-run ref MUST reset on unmount: it survives a StrictMode
  // remount, and without the reset the second mount pass fires a redundant
  // animated layout against the fresh instance.
  const layoutMounted = useRef(false);
  useEffect(() => {
    return () => {
      layoutMounted.current = false;
    };
  }, []);
  useEffect(() => {
    const cy = getCy();
    if (!cy) return;
    if (!layoutMounted.current) {
      layoutMounted.current = true;
      return;
    }
    cy.stop(true);
    runLayoutAndFit(
      cy,
      buildLinkLayout(layoutId, true, cy.nodes().length, rootId),
    );
  }, [layoutId]);

  // SELECTION → pin focus on the selected node.
  useEffect(() => {
    const cy = getCy();
    if (!cy) return;
    if (selectedId) {
      focusNeighborhood(cy, selectedId);
      cy.batch(() => {
        cy.elements().unselect();
        const el = cy.getElementById(selectedId);
        if (!el.empty()) el.select();
      });
    } else {
      clearFocus(cy);
      cy.elements().unselect();
    }
  }, [selectedId]);

  // SEARCH → accent matches, fade the rest.
  useEffect(() => {
    const cy = getCy();
    if (cy) applySearch(cy, searchQuery);
  }, [searchQuery]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

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

      {/* Minimap — navigator renders into this (see kg-graph minimap.css note:
          the plugin sets this className imperatively; matching it in JSX keeps
          React from wiping it on re-render). */}
      <div id={minimapId} className="cytoscape-navigator" />
    </div>
  );
}
