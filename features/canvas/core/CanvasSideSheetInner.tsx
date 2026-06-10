"use client";

/**
 * CanvasSideSheet — the global right-side canvas surface.
 *
 * Modeled on the Claude.ai canvas: a slide-in panel anchored to the right
 * edge of the viewport, available on every route (mounted once via
 * `DeferredIslands` for `(a)/*` and directly in `(public)/layout.tsx`).
 *
 * Responsibilities owned here:
 *  - Slide-in container with backdrop-free overlay (does not dim the page).
 *  - Resizable WIDTH via a glass drag handle on the left edge.
 *  - Optional VERTICAL SPLIT — when `secondaryItemId` is set in Redux,
 *    renders two panes stacked with a draggable horizontal handle, each
 *    pane independently rendering its own canvas item.
 *  - Mobile: fullscreen overlay, drops the split (single pane only — split
 *    is desktop-only because the panes need real estate to be useful).
 *  - Listens for the global ⌘\ shortcut → toggles open/closed.
 *
 * The actual content of each pane (header chrome + body) lives in
 * `CanvasPane.tsx`, so this shell stays purely about layout / placement.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectCanvasIsOpen,
  selectCurrentCanvasItem,
  selectSecondaryCanvasItem,
  selectCanvasSplitRatio,
  selectCanvasWidth,
  closeCanvas,
  toggleCanvas,
  setCanvasWidth,
  setCanvasSplitRatio,
} from "@/features/canvas/redux/canvasSlice";
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

export function CanvasSideSheetInner() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectCanvasIsOpen);
  const currentItem = useAppSelector(selectCurrentCanvasItem);
  const secondaryItem = useAppSelector(selectSecondaryCanvasItem);
  const splitRatio = useAppSelector(selectCanvasSplitRatio);
  const storedWidth = useAppSelector(selectCanvasWidth);
  const isMobile = useIsMobile();

  // Width-resize from the left edge ────────────────────────────────────────
  const [isResizing, setIsResizing] = useState(false);

  const handleClose = useCallback(() => {
    dispatch(closeCanvas());
  }, [dispatch]);

  useEffect(() => {
    if (!isResizing) return;
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

  // Global keyboard shortcut: ⌘\ / Ctrl+\ toggles the canvas if there's
  // anything to show. Bound here so every authenticated + public surface
  // gets it for free. Ignored when focus is in a text field, so users mid-
  // typing don't get yanked into / out of the canvas accidentally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "\\") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      const typing =
        t?.tagName === "INPUT" ||
        t?.tagName === "TEXTAREA" ||
        t?.isContentEditable;
      if (typing) return;
      e.preventDefault();
      dispatch(toggleCanvas());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  if (!currentItem) return null;

  const canvasTitle =
    typeof currentItem.content.metadata?.title === "string"
      ? currentItem.content.metadata.title
      : "Canvas";

  const width = Math.min(Math.max(storedWidth || DEFAULT_WIDTH, MIN_WIDTH), MAX_WIDTH);
  const showSplit = !!secondaryItem && !isMobile;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        hideCloseButton
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
          height: isMobile ? "100dvh" : "100vh",
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
        <div
          className={cn(
            "h-full",
            isMobile ? "" : "p-1.5 pl-1",
          )}
        >
          <div
            className={cn(
              "h-full w-full flex flex-col overflow-hidden",
              "bg-card text-card-foreground",
              isMobile
                ? "border-l border-border"
                : "rounded-xl border border-border shadow-[0_8px_32px_-12px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]",
            )}
          >
            {showSplit ? (
              <ResizablePanelGroup
                orientation="vertical"
                onLayout={(sizes) => {
                  if (sizes.length === 2 && Number.isFinite(sizes[0])) {
                    dispatch(setCanvasSplitRatio(Math.round(sizes[0])));
                  }
                }}
              >
                <ResizablePanel
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
                  defaultSize={100 - splitRatio}
                  minSize={20}
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
  );
}
