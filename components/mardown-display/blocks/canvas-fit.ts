/**
 * How much room a block has when it is shown in the canvas.
 *
 * `@ai-matrx/canvas` tells content it is in a canvas pane through
 * `useCanvasPresentation()` (null everywhere else). Blocks that render in both
 * the chat and the canvas read this ONE answer so a tall, narrow pane gets a
 * layout built for it — stacked cards, one column, side panels above the body —
 * while the chat and every other host keep exactly the layout they had.
 *
 *   outside — not in the canvas; the block renders as it always did.
 *   narrow  — the pane is under CANVAS_NARROW_WIDTH (480px): restructure.
 *   tight   — wider than narrow but not roomy (< 768px) and not full screen:
 *             keep the structure, ease the squeeze (e.g. pin a table's first column).
 *   wide    — roomy, or the pane is full screen: the normal layout.
 *
 * A person's explicit choice always wins over this hint (see the diagram
 * reference adopter, `diagram/presentation-direction.ts`).
 */
import type { CanvasPresentation } from "@ai-matrx/canvas";
import { useCanvasPresentation } from "@ai-matrx/canvas/react";

export type CanvasFit = "outside" | "narrow" | "tight" | "wide";

/** Below this a not-full-screen pane is "tight" (between narrow and roomy). */
export const CANVAS_TIGHT_WIDTH = 768;

export function canvasFitFor(
  presentation: CanvasPresentation | null | undefined,
): CanvasFit {
  if (!presentation) return "outside";
  if (presentation.isNarrow) return "narrow";
  if (presentation.isFullscreen) return "wide";
  if (presentation.width > 0 && presentation.width < CANVAS_TIGHT_WIDTH) {
    return "tight";
  }
  return "wide";
}

export function useCanvasFit(): CanvasFit {
  return canvasFitFor(useCanvasPresentation());
}
