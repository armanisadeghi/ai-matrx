"use client";

/**
 * The phone overflow sheet's Canvas row, on top of @ai-matrx/canvas. The
 * desktop header uses the package's own `CanvasToggle` directly.
 */

import { selectCanvasActiveItem, selectCanvasIsOpen, selectCanvasItemCount } from "@ai-matrx/canvas";
import { getCanvasKind, itemTitle, useCanvas, useCanvasIsPresented, useCanvasState } from "@ai-matrx/canvas/react";

export function useCanvasHeaderToggle() {
  const canvas = useCanvas();
  const isOpen = useCanvasState(selectCanvasIsOpen);
  const itemCount = useCanvasState(selectCanvasItemCount);
  const active = useCanvasState(selectCanvasActiveItem);
  const isPresented = useCanvasIsPresented();
  const headlineTitle = active ? itemTitle(active, getCanvasKind(active.kind)) : "Canvas";
  return {
    isOpen,
    isAvailable: isPresented,
    availabilityKnown: true,
    homeOnly: false,
    itemCount,
    headlineTitle,
    reopen: () => canvas.show(),
    putAway: () => canvas.hide(),
  };
}
