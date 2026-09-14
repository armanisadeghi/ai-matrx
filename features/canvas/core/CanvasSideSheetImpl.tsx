"use client";

/**
 * CanvasSideSheetImpl — the OVERLAY presentation of the canvas.
 *
 * This is the fallback, not the default. Where a route gives the canvas a real
 * column (`CanvasDock` — the chat does), the canvas is a RESIZABLE SPLIT and
 * this sheet renders nothing: the front door bails on `selectCanvasIsDocked`.
 * An overlay is correct only where there is no room to split — the phone — and
 * on routes that never mounted a dock (marketing, share links, artifact pages).
 *
 * Owner standard (2026-09-13): *"we have an entire Canvas system that gives us
 * a nice adjustable sidebar that can be folded out and in"* — the thread
 * shrinks, nothing is covered. A z-50 sheet drawn over the chat covered the
 * composer, the mic and the send button and cut prose mid-word; that defect is
 * what the dock exists to end.
 *
 * NEVER import this module statically (the `@/…Impl` eslint ban enforces it).
 * The only consumer is the thin front door `./CanvasSideSheet.tsx`, which
 * dynamic({ssr:false})-imports it and mounts it ONLY once a canvas item exists.
 *
 * Owned here: placement (right edge), the width drag handle, the Radix Sheet.
 * The card, the vertical split and the pane chrome live in `CanvasSurface.tsx`
 * so the docked presentation is the same content, not a fork.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectCanvasIsOpen,
  selectCurrentCanvasItem,
  selectCanvasWidth,
  closeCanvas,
  setCanvasWidth,
  setCanvasSplitRatio,
} from "@/features/canvas/redux/canvasSlice";
import { Sheet, SheetContent, SheetTitle } from "@ai-matrx/design-system";
import { CanvasSurfaceCard } from "./CanvasSurface";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 480;
const MAX_WIDTH = 1400;
const DEFAULT_WIDTH = 768;

export function CanvasSideSheetImpl() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectCanvasIsOpen);
  const currentItem = useAppSelector(selectCurrentCanvasItem);
  const storedWidth = useAppSelector(selectCanvasWidth);
  const isMobile = useIsMobile();

  // Width-resize from the left edge ────────────────────────────────────────
  const [isResizing, setIsResizing] = useState(false);

  const handleClose = useCallback(() => {
    dispatch(closeCanvas());
  }, [dispatch]);

  const handleSplitRatioChange = useCallback(
    (topPercent: number) => {
      dispatch(setCanvasSplitRatio(topPercent));
    },
    [dispatch],
  );

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

  return (
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
        //   2. inner glass card (CanvasSurfaceCard) — bg + border + shadow.
        // No backdrop blur on the page — the canvas overlays without dimming.
        className={cn(
          "p-0 gap-0 overflow-visible border-l-0 bg-transparent shadow-none",
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
                isResizing ? "bg-primary" : "bg-border group-hover:bg-primary/70",
              )}
            />
          </div>
        )}

        <div className="h-full">
          <CanvasSurfaceCard
            presentation="sheet"
            edge={isMobile ? "flush" : "floating"}
            onSplitRatioChange={handleSplitRatioChange}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
