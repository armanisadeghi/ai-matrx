"use client";

/**
 * CanvasHomeSheet — what the header's Canvas button opens when nothing is on
 * the canvas yet.
 *
 * The owner's ruling (2026-09-30): the Canvas control is "permanently there,
 * always available and clickable". A disabled button that only explained
 * itself taught nobody what the canvas holds. Home is the permanent canvas's
 * front door: the person's saved canvas items (open one and it takes the
 * canvas, which closes home) and their Board — the full-page canvas.
 *
 * Same sheet geometry as the item canvas (`CanvasSideSheetImpl`): right side,
 * no page dim on desktop, full screen on a phone.
 */

import { LayoutDashboard, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@ai-matrx/design-system";
import AppLink from "@/components/navigation/AppLink";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeCanvasHome } from "@/features/canvas/redux/canvasSlice";
import { useIsMobile } from "@/hooks/use-mobile";
import { SavedCanvasItems } from "./SavedCanvasItems";

const HOME_WIDTH = 560;

export function CanvasHomeSheet() {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const close = () => dispatch(closeCanvasHome());

  return (
    <Sheet open modal={isMobile} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="right"
        hideCloseButton
        hideOverlay={!isMobile}
        className="gap-0 border-l border-border bg-card p-0"
        style={{
          width: isMobile ? "100%" : `${HOME_WIDTH}px`,
          maxWidth: "100%",
          height: "100dvh",
          zIndex: 10000,
        }}
        onPointerDownOutside={(e) => e.preventDefault()}
        data-canvas-home=""
      >
        <SheetTitle className="sr-only">Canvas</SheetTitle>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border pl-3 pr-1">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              Canvas
            </span>
            <AppLink
              href="/board"
              onClick={close}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground hover:bg-accent"
            >
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
              Open your Board
            </AppLink>
            <button
              type="button"
              onClick={close}
              aria-label="Close canvas"
              title="Close canvas"
              className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SavedCanvasItems />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
