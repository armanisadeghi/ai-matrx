"use client";

/**
 * Runtime scope builder for the `matrx-user/canvas` surface.
 *
 * Turns the canvas slice's live state into the declared surface payload. It
 * lives beside the feature (not in the manifest) because the derivation is
 * real work: resolving the DURABLE `canvas_items` id out of two places it can
 * hang, and flattening possibly-ReactNode titles to plain text.
 *
 * Everything here describes the PANE and the open item. Nothing reaches
 * inside an artifact renderer — that content belongs to the artifact's own
 * surface (mermaid-editor, html-page, working-document, scratchpad).
 */

import {
  createCanvasScope,
  type CanvasOpenItemSummary,
} from "@/features/surfaces/manifests/canvas.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type {
  CanvasItem,
  CanvasRenderMode,
} from "@/features/canvas/redux/canvasSlice";
import { titleToString } from "@/features/canvas/core/CanvasBody";

/**
 * The durable `canvas_items` UUID for an open item, or undefined while the
 * item is session-only. It can hang off either `savedItemId` (set by
 * `openArtifactInCanvas` / after a save) or `metadata.canvasItemId` (set when
 * a materialized artifact is opened), so both are checked.
 */
function resolveCanvasId(item: CanvasItem): string | undefined {
  const id = item.savedItemId ?? item.content.metadata?.canvasItemId;
  return typeof id === "string" && id.trim() ? id : undefined;
}

/** Plain-text title, or "" when the item carries none. */
function resolveTitle(item: CanvasItem): string {
  return titleToString(item.content.metadata?.title);
}

export interface BuildCanvasScopeInput {
  items: CanvasItem[];
  currentItemId: string | null;
  secondaryItemId: string | null;
  renderMode: CanvasRenderMode;
  /**
   * Whether the pane is ACTUALLY rendering two stacked artifacts. This is the
   * shell's own `!!secondaryItem && !isMobile` — mobile drops the split, so
   * the slice's `secondaryItemId` alone would over-report it.
   */
  isSplit: boolean;
}

/**
 * Build the live `matrx-user/canvas` scope.
 *
 * Returns an EMPTY payload when nothing is open. The provider mounts only
 * once an item exists, but `getScope` runs at Run time — the user can close
 * the canvas between mount and launch, and an empty bag is the honest answer
 * then rather than a stale snapshot.
 */
export function buildCanvasScope(
  input: BuildCanvasScopeInput,
): SurfaceScopePayload {
  const { items, currentItemId, secondaryItemId, renderMode, isSplit } = input;

  const currentItem = currentItemId
    ? (items.find((item) => item.id === currentItemId) ?? null)
    : null;

  if (!currentItem) return {} as SurfaceScopePayload;

  const openItems: CanvasOpenItemSummary[] = items.map((item) => ({
    session_id: item.id,
    canvas_id: resolveCanvasId(item),
    type: item.content.type,
    title: resolveTitle(item),
  }));

  const secondaryItem = secondaryItemId
    ? (items.find((item) => item.id === secondaryItemId) ?? null)
    : null;

  // Only a real object payload is emitted — a materialized artifact's `data`
  // is the pointer `{ artifactId }`, which is honest and declared as such.
  const data = currentItem.content.data;
  const canvasJson =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;

  const currentCanvasId = resolveCanvasId(currentItem);
  const title = resolveTitle(currentItem);

  return createCanvasScope({
    current_canvas_id: currentCanvasId,
    current_canvas_type: currentItem.content.type,
    current_canvas_title: title || undefined,
    current_canvas_is_saved: !!currentCanvasId,
    canvas_json: canvasJson,

    open_items: openItems,
    item_count: items.length,
    is_split: isSplit,
    secondary_canvas_id: secondaryItem
      ? resolveCanvasId(secondaryItem)
      : undefined,
    render_mode: renderMode,
  });
}
