"use client";

/**
 * useCanvasOpenGuard — "is there a canvas on this screen at all?", asked BEFORE
 * a request is made. The canvas exists wherever its provider is mounted (every
 * layout that renders `Providers`); outside one, the person is told the canvas
 * is not reachable here instead of nothing happening.
 */

import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { reportCanvasOpenDrop } from "@/features/canvas/openRequest";

export function useCanvasOpenGuard() {
  const isCanvasAvailable = useOptionalCanvas() !== null;

  /** True when the canvas can actually show something; announces and returns false when it cannot. */
  const ensureCanvasReachable = (requested?: string | null): boolean => {
    if (isCanvasAvailable) return true;
    return reportCanvasOpenDrop({ reason: "canvas-unavailable", requested });
  };

  return { isCanvasAvailable, ensureCanvasReachable };
}
