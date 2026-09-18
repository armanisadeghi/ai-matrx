"use client";

/**
 * useCanvasOpenGuard — "is there a canvas on this screen at all?", asked BEFORE
 * a request is dispatched into it.
 *
 * The canvas slice happily accepts an open for a route that mounts no canvas
 * surface: the item lands in `state.items`, `isOpen` flips to true, and
 * absolutely nothing renders. That is the silent no-op this guard removes —
 * the caller either learns it can proceed, or the person is told the canvas is
 * not reachable here and what to do instead (`reportCanvasOpenDrop`).
 */

import { useCallback } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectCanvasIsAvailable } from "@/features/canvas/redux/canvasSlice";
import { reportCanvasOpenDrop } from "@/features/canvas/openRequest";

export function useCanvasOpenGuard() {
  const isCanvasAvailable = useAppSelector(selectCanvasIsAvailable);

  /** True when the canvas can actually show something; announces and returns
   *  false when it cannot. */
  const ensureCanvasReachable = useCallback(
    (requested?: string | null): boolean => {
      if (isCanvasAvailable) return true;
      return reportCanvasOpenDrop({ reason: "canvas-unavailable", requested });
    },
    [isCanvasAvailable],
  );

  return { isCanvasAvailable, ensureCanvasReachable };
}
