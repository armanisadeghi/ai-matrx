"use client";

/**
 * useCanvasOpenGuard — "is there a canvas on this screen at all?", asked BEFORE
 * a request is made. The canvas exists wherever its provider is mounted (every
 * layout that renders `Providers`) and outside a `CanvasUnavailableBoundary`;
 * elsewhere the person is told the canvas is not reachable here instead of
 * nothing happening.
 */

import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { reportCanvasOpenDrop } from "@/features/canvas/openRequest";
import { useCanvasSuppressed } from "@/features/canvas/core/CanvasUnavailableBoundary";

export function useCanvasOpenGuard() {
  // Inside a CanvasUnavailableBoundary an immersive viewer owns the screen, so
  // the canvas is not reachable from there even though a provider is mounted.
  const suppressed = useCanvasSuppressed();
  const isCanvasAvailable = useOptionalCanvas() !== null && !suppressed;

  /** True when the canvas can actually show something; announces and returns false when it cannot. */
  const ensureCanvasReachable = (requested?: string | null): boolean => {
    if (isCanvasAvailable) return true;
    return reportCanvasOpenDrop({ reason: "canvas-unavailable", requested });
  };

  return { isCanvasAvailable, ensureCanvasReachable };
}
