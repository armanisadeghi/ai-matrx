/**
 * Names and scope builder of `canvas`, kept apart from the manifest body so
 * eagerly loaded features can import them without pulling the manifest
 * (descriptions, write targets) into the shell's first-load JS.
 */
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";
import type { CanvasItemReference } from "@/features/canvas/lib/canvas-item-reference";

export const CANVAS_SURFACE_NAME = "matrx-user/canvas";

/**
 * One entry of `open_items`: what the person sees on the tab, and the record it
 * shows (absent while the item is session-only). No tab id — agents name an
 * item by its reference.
 */
export interface CanvasOpenItemSummary {
  title: string;
  type: string;
  is_current: boolean;
  item?: CanvasItemReference;
}

/**
 * Scope builder for `matrx-user/canvas`.
 *
 * Required (no `?`) keys mirror every `alwaysAvailable: true` value — the
 * emitter mounts only once an item is open, which is what makes
 * `open_items` / `item_count` guaranteed. `current_canvas_type` is absent while
 * a non-item tab (Agent context) has focus.
 */
export function createCanvasScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;

  // Open canvas item
  current_canvas_item?: CanvasItemReference;
  current_canvas_type?: string;
  current_canvas_title?: string;
  current_canvas_is_saved: boolean;
  canvas_json?: Record<string, unknown>;

  // Canvas session
  open_items: CanvasOpenItemSummary[];
  item_count: number;
  is_split: boolean;
  secondary_canvas_item?: CanvasItemReference;
  render_mode: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
