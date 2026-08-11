"use client";

/**
 * CanvasSideSheetImpl — the HEAVY core of the global right-side canvas
 * surface (Claude.ai-style slide-in panel). Its static graph is the whole
 * canvas machinery: CanvasPane → renderers → materialization → content-IR.
 *
 * NEVER import this module statically (the `@/…Impl` eslint ban enforces
 * it). The only consumer is the thin front door `./CanvasSideSheet.tsx`,
 * which dynamic({ssr:false})-imports it and mounts it ONLY once a canvas
 * item exists — keeping this entire subtree out of the server compile and
 * out of every route's initial chunk (it used to ride statically on every
 * (public) page).
 *
 * Responsibilities owned here:
 *  - Slide-in container with backdrop-free overlay (does not dim the page).
 *  - Resizable WIDTH via a glass drag handle on the left edge.
 *  - Optional VERTICAL SPLIT — when `secondaryItemId` is set in Redux,
 *    renders two panes stacked with a draggable horizontal handle, each
 *    pane independently rendering its own canvas item.
 *  - Mobile: fullscreen overlay, drops the split (single pane only — split
 *    is desktop-only because the panes need real estate to be useful).
 *
 * NOT owned here (they must run even when this chunk was never fetched, so
 * they live in the always-mounted front door `CanvasSideSheet.tsx`):
 *  - `setCanvasAvailable` mount/unmount signaling.
 *  - The global ⌘\ / Ctrl+\ toggle shortcut.
 *
 * The actual content of each pane (header chrome + body) lives in
 * `CanvasPane.tsx`, so this shell stays purely about layout / placement.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectCanvasIsOpen,
  selectCanvasItems,
  selectCanvasRenderMode,
  selectCurrentCanvasItem,
  selectCurrentItemId,
  selectSecondaryCanvasItem,
  selectSecondaryCanvasItemId,
  selectCanvasSplitRatio,
  selectCanvasWidth,
  closeCanvas,
  setCanvasWidth,
  setCanvasSplitRatio,
} from "@/features/canvas/redux/canvasSlice";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CANVAS_SURFACE_NAME } from "@/features/surfaces/manifests/canvas.manifest";
import { buildCanvasScope } from "@/features/canvas/lib/canvas-scope";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { CanvasPane } from "./CanvasPane";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 480;
const MAX_WIDTH = 1400;
const DEFAULT_WIDTH = 768;
const CANVAS_TOP_PANEL_ID = "canvas-top";
const CANVAS_BOTTOM_PANEL_ID = "canvas-bottom";

export function CanvasSideSheetImpl() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectCanvasIsOpen);
  const currentItem = useAppSelector(selectCurrentCanvasItem);
  const secondaryItem = useAppSelector(selectSecondaryCanvasItem);
  const splitRatio = useAppSelector(selectCanvasSplitRatio);
  const storedWidth = useAppSelector(selectCanvasWidth);
  const isMobile = useIsMobile();

  // Surface emitter ────────────────────────────────────────────────────────
  // `getScope` runs at Run time, not on render, so it reads the canvas slice
  // straight off the store rather than closing over rendered state — the user
  // can switch or close an item between mount and launch. `isMobile` is React
  // state (not Redux), so it rides a ref advanced on every render.
  const store = useAppStore();
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  const getCanvasScope = useCallback(() => {
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

  // Width-resize from the left edge ────────────────────────────────────────
  const [isResizing, setIsResizing] = useState(false);

  const handleClose = useCallback(() => {
    dispatch(closeCanvas());
  }, [dispatch]);

  useEffect(() => {
    if (!isResizing) return undefined;
    const onMove = (e: MouseEvent) => {
      const next = window.innerWidth - e.clientX;
      const clamped = Math.min(Math.max(next, MIN_WIDTH), MAX_WIDTH);
      dispatch(setCanvasWidth(clamped));
    };
    const onUp = () => setIsResizing(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isResizing, dispatch]);

  useEffect(() => {
    if (isResizing) {
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    } else {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
  }, [isResizing]);

  // Hide the shell-header avatar while open — CanvasPane header replaces it.
  useEffect(() => {
    if (isOpen) {
      document.documentElement.dataset.canvasOpen = "true";
    } else {
      delete document.documentElement.dataset.canvasOpen;
    }
    return () => {
      delete document.documentElement.dataset.canvasOpen;
    };
  }, [isOpen]);

  if (!currentItem) return null;

  const canvasTitle =
    typeof currentItem.content.metadata?.title === "string"
      ? currentItem.content.metadata.title
      : "Canvas";

  const width = Math.min(
    Math.max(storedWidth || DEFAULT_WIDTH, MIN_WIDTH),
    MAX_WIDTH,
  );
  const showSplit = !!secondaryItem && !isMobile;

  return (
    <SurfaceRuntimeProvider
      surfaceName={CANVAS_SURFACE_NAME}
      getScope={getCanvasScope}
    >
      <Sheet
        open={isOpen}
        modal={isMobile}
        onOpenChange={(open) => !open && handleClose()}
      >
        <SheetContent
          side="right"
          hideCloseButton
          hideOverlay={!isMobile}
          // Two-layer chrome:
          //   1. outer SheetContent: positions on the right, owns width, owns
          //      the z-index that puts the canvas above modals (10000).
          //   2. inner glass card: bg + border + shadow — read as one
          //      continuous floating surface against the page.
          // No backdrop blur on the page — the canvas overlays without dimming.
          className={cn(
            "p-0 gap-0 overflow-visible border-l-0 bg-transparent shadow-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
          )}
          style={{
            width: isMobile ? "100%" : `${width}px`,
            maxWidth: isMobile ? "100%" : `${width}px`,
            height: isMobile ? "100dvh" : "100dvh",
            zIndex: 10000,
          }}
          onPointerDownOutside={(e) => {
            // Don't close from arbitrary clicks elsewhere — too easy to lose
            // the canvas accidentally while interacting with other UI.
            e.preventDefault();
          }}
        >
          <SheetTitle className="sr-only">{canvasTitle}</SheetTitle>

          {/* Left-edge resize handle — only on desktop. Sits OUTSIDE the
            visual card so the hit target extends slightly into the page. */}
          {!isMobile && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizing(true);
              }}
              className={cn(
                "group absolute top-0 bottom-0 left-0 z-30 w-2 -translate-x-1/2",
                "cursor-col-resize flex items-center justify-center",
              )}
              aria-label="Resize canvas width"
              role="separator"
            >
              <div
                className={cn(
                  "w-1 h-12 rounded-full transition-colors",
                  isResizing
                    ? "bg-primary"
                    : "bg-border group-hover:bg-primary/70",
                )}
              />
            </div>
          )}

          {/* Visual card. Padding outside the card so the rounded corners feel
            inset from the viewport edge — matches the floating chat header
            language. Mobile: edge-to-edge (no padding, no rounding). */}
          <div className={cn("h-full")}>
            <div
              className={cn(
                "h-full w-full flex flex-col overflow-hidden",
                "bg-card text-card-foreground",
                isMobile
                  ? "border-l border-border"
                  : "rounded-l-xl border-l border-border shadow-[0_8px_32px_-12px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]",
              )}
            >
              {showSplit ? (
                <ResizablePanelGroup
                  orientation="vertical"
                  // v4: Layout is a {panelId: flexGrow} map (not number[]) and
                  // the settle-time callback is onLayoutChanged. Normalize to a
                  // percentage so the stored ratio is stable regardless of how
                  // flexGrow values are scaled.
                  onLayoutChanged={(layout) => {
                    const top = layout[CANVAS_TOP_PANEL_ID];
                    const bottom = layout[CANVAS_BOTTOM_PANEL_ID];
                    if (
                      Number.isFinite(top) &&
                      Number.isFinite(bottom) &&
                      top + bottom > 0
                    ) {
                      dispatch(
                        setCanvasSplitRatio(
                          Math.round((top / (top + bottom)) * 100),
                        ),
                      );
                    }
                  }}
                >
                  <ResizablePanel
                    id={CANVAS_TOP_PANEL_ID}
                    defaultSize={splitRatio}
                    minSize={20}
                    style={{ overflow: "hidden", height: "100%" }}
                  >
                    <CanvasPane paneRole="top" />
                  </ResizablePanel>
                  {/* Cursor override: the wrapper hard-codes col-resize for
                    horizontal groups. In a vertical group the handle runs
                    horizontally so the user expects row-resize. */}
                  <ResizableHandle style={{ cursor: "row-resize" }} />
                  <ResizablePanel
                    id={CANVAS_BOTTOM_PANEL_ID}
                    defaultSize={100 - splitRatio}
                    minSize={15}
                    style={{ overflow: "hidden", height: "100%" }}
                  >
                    <CanvasPane paneRole="bottom" />
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <CanvasPane paneRole="single" />
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </SurfaceRuntimeProvider>
  );
}
