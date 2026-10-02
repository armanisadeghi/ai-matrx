"use client";

/**
 * Opens one non-artifact kind (a record peek, a source preview, an answer) on
 * the canvas — the kind-agnostic twin of `openArtifactContent`. Same rule:
 * a request the canvas cannot honour is announced through the ONE drop
 * reporter, never dropped.
 */

import type { CanvasController, CanvasItemId, CanvasOpenInput } from "@ai-matrx/canvas";
import { reportCanvasOpenDrop } from "@/features/canvas/openRequest";

export function openCanvasItem(canvas: CanvasController | null, input: CanvasOpenInput): CanvasItemId | null {
  // A provider with no column on screen (kiosk, meeting stage) cannot show anything.
  if (!canvas || !canvas.isPresented()) {
    reportCanvasOpenDrop({ reason: "canvas-unavailable", requested: input.title ?? null, detail: `${input.kind}::${input.key}` });
    return null;
  }
  return canvas.open(input);
}
