"use client";

/**
 * features/marketing/seo/topical-map/canvas/useOpenTopicalMapCanvas.ts — the
 * ONE door from anywhere in chat to a map in the side canvas.
 *
 * Goes through `useCanvas().open`, which ANNOUNCES a request the canvas
 * cannot honour (no canvas surface on this route) instead of dropping it —
 * a click that silently does nothing is the defect "nothing fails silently"
 * names. Returns what `open` returns: whether the canvas took the map.
 */

import { useCallback } from "react";

import { useCanvas } from "@/features/canvas/hooks/useCanvas";

import {
  buildTopicalMapCanvasContent,
  type BuildTopicalMapCanvasContentOptions,
} from "./topicalMapCanvasContent";

export function useOpenTopicalMapCanvas() {
  const { open } = useCanvas();
  return useCallback(
    (opts: BuildTopicalMapCanvasContentOptions): boolean =>
      open(buildTopicalMapCanvasContent(opts)),
    [open],
  );
}
