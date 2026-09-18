"use client";

/**
 * CanvasSurface — the canvas CONTENT: the glass card, the optional vertical
 * split, and the per-pane header chrome.
 *
 * THERE IS EXACTLY ONE PRESENTATION — `CanvasSideSheetImpl`, mounted globally
 * by `CanvasSideSheet`, identical on every route. A second, per-route
 * presentation (a docked column for chat) existed between 2026-09-14 and
 * 2026-09-17 and was rejected by the owner as an unnecessary layer. Anything a
 * route needs from the canvas is built into the one surface, for every route.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectCanvasItems,
  selectCanvasRenderMode,
  selectCanvasSplitRatio,
  selectCurrentItemId,
  selectSecondaryCanvasItem,
  selectSecondaryCanvasItemId,
} from "@/features/canvas/redux/canvasSlice";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CANVAS_SURFACE_NAME } from "@/features/surfaces/manifests/canvas.manifest";
import { buildCanvasScope } from "@/features/canvas/lib/canvas-scope";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { CanvasPane } from "./CanvasPane";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export const CANVAS_TOP_PANEL_ID = "canvas-top";
export const CANVAS_BOTTOM_PANEL_ID = "canvas-bottom";

/**
 * The surface emitter. `getScope` runs at Run time, not on render, so it reads
 * the canvas slice straight off the store rather than closing over rendered
 * state — the user can switch or close an item between mount and launch.
 */
export function useCanvasSurfaceScope() {
  const store = useAppStore();
  const isMobile = useIsMobile();
  const isMobileRef = useRef(isMobile);

  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  return useCallback(() => {
    const state = store.getState();
    const secondaryItemId = selectSecondaryCanvasItemId(state);
    return buildCanvasScope({
      items: selectCanvasItems(state),
      currentItemId: selectCurrentItemId(state),
      secondaryItemId,
      renderMode: selectCanvasRenderMode(state),
      // Mirrors `showSplit` below — mobile drops the split entirely.
      isSplit: !!secondaryItemId && !isMobileRef.current,
    });
  }, [store]);
}

/**
 * The vertical split (or the single pane). No card chrome, no placement —
 * `CanvasSideSheetImpl` owns those.
 */
export function CanvasPanes({
  onSplitRatioChange,
}: {
  onSplitRatioChange: (topPercent: number) => void;
}) {
  const secondaryItem = useAppSelector(selectSecondaryCanvasItem);
  const splitRatio = useAppSelector(selectCanvasSplitRatio);
  const isMobile = useIsMobile();
  const showSplit = !!secondaryItem && !isMobile;

  if (!showSplit) return <CanvasPane paneRole="single" />;

  return (
    <ResizablePanelGroup
      orientation="vertical"
      // v4: Layout is a {panelId: flexGrow} map (not number[]) and the
      // settle-time callback is onLayoutChanged. Normalize to a percentage so
      // the stored ratio is stable regardless of how flexGrow is scaled.
      onLayoutChanged={(layout: Record<string, number>) => {
        const top = layout[CANVAS_TOP_PANEL_ID];
        const bottom = layout[CANVAS_BOTTOM_PANEL_ID];
        if (
          Number.isFinite(top) &&
          Number.isFinite(bottom) &&
          top + bottom > 0
        ) {
          onSplitRatioChange(Math.round((top / (top + bottom)) * 100));
        }
      }}
    >
      {/* v4 sizes: a BARE NUMBER IS PIXELS. These ratios are percentages, so
        they must carry the unit or a 55% pane paints 55px tall. */}
      <ResizablePanel
        id={CANVAS_TOP_PANEL_ID}
        defaultSize={`${splitRatio}%`}
        minSize="20%"
        style={{ overflow: "hidden", height: "100%" }}
      >
        <CanvasPane paneRole="top" />
      </ResizablePanel>
      {/* Cursor override: the wrapper hard-codes col-resize for horizontal
        groups. In a vertical group the handle runs horizontally so the user
        expects row-resize. */}
      <ResizableHandle style={{ cursor: "row-resize" }} />
      <ResizablePanel
        id={CANVAS_BOTTOM_PANEL_ID}
        defaultSize={`${100 - splitRatio}%`}
        minSize="15%"
        style={{ overflow: "hidden", height: "100%" }}
      >
        <CanvasPane paneRole="bottom" />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/**
 * The glass card that reads as one continuous surface, wrapping the panes.
 * `edge` only changes the border treatment: a desktop sheet floats over the
 * page and gets a rounded, shadowed left edge; a full-bleed phone sheet is
 * part of the page and gets a plain divider.
 */
export function CanvasSurfaceCard({
  edge,
  onSplitRatioChange,
}: {
  /** `floating` = rounded + shadowed (overlay); `flush` = plain divider. */
  edge: "floating" | "flush";
  onSplitRatioChange: (topPercent: number) => void;
}) {
  const getScope = useCanvasSurfaceScope();
  return (
    <SurfaceRuntimeProvider
      surfaceName={CANVAS_SURFACE_NAME}
      getScope={getScope}
    >
      <div
        className={cn(
          "h-full w-full flex flex-col overflow-hidden",
          "bg-card text-card-foreground",
          edge === "floating"
            ? "rounded-l-xl border-l border-border shadow-[0_8px_32px_-12px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]"
            : "border-l border-border",
        )}
        data-canvas-surface="sheet"
      >
        <CanvasPanes onSplitRatioChange={onSplitRatioChange} />
      </div>
    </SurfaceRuntimeProvider>
  );
}
