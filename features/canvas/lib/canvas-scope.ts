"use client";

/**
 * Runtime scope builder for the `matrx-user/canvas` surface.
 *
 * Turns the canvas's live state into the declared surface payload. It
 * lives beside the feature (not in the manifest) because the derivation is
 * real work: resolving the RECORD each item shows (a published page, a saved
 * canvas artifact) into a labeled reference, and flattening possibly-ReactNode
 * titles to plain text. Tab ids never leave the canvas.
 *
 * Everything here describes the PANE and the open item. Nothing reaches
 * inside an artifact renderer — that content belongs to the artifact's own
 * surface (mermaid-editor, html-page, working-document, scratchpad).
 */

import { createCanvasScope, type CanvasOpenItemSummary } from "@/features/surfaces/manifests/canvas.surface";
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";
import {
  canvasItemRecord,
  canvasItemReference,
  type CanvasItemReference,
} from "@/features/canvas/lib/canvas-item-reference";
import {
  getDefaultTitle,
  titleToString,
  type CanvasContent,
} from "@/features/canvas/canvasContent";

/** One open canvas tab, as the scope sees it. */
export interface CanvasScopeItem {
  /** The tab's identity on the canvas (session only — never sent to agents). */
  id: string;
  content: CanvasContent;
  /** canvas_items.id once the tab was saved. */
  savedItemId?: string;
}

export type CanvasRenderMode = "inline" | "global" | "auto";

type CanvasItem = CanvasScopeItem;

/** Plain-text title, or "" when the item carries none. */
function resolveTitle(item: CanvasItem): string {
  return titleToString(item.content.metadata?.title);
}

/**
 * The item as a labeled reference to the record it shows, or undefined while
 * it is session-only. This — never the tab id — is how agents name an item.
 */
export function referenceFor(item: CanvasItem): CanvasItemReference | undefined {
  const record = canvasItemRecord(item.content, item.savedItemId);
  // The name the person sees on the tab — its title, else the tab's own
  // default for that type ("Web View") — never the record type.
  const label = resolveTitle(item) || getDefaultTitle(item.content.type);
  return record ? canvasItemReference(record, label) : undefined;
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

  // Nothing open → nothing to say. A NON-ITEM tab in focus (Agent context,
  // Surface values) is not "nothing open": every item is still listed with its
  // reference, so the agent can read and edit it (2026-10-03 — the whole scope
  // used to vanish, and the agent said it had no open_items).
  if (items.length === 0) return {} as SurfaceScopePayload;

  const openItems: CanvasOpenItemSummary[] = items.map((item) => {
    const reference = referenceFor(item);
    return {
      title: resolveTitle(item),
      type: item.content.type,
      is_current: item.id === currentItem?.id,
      ...(reference ? { item: reference } : {}),
    };
  });

  const secondaryItem = secondaryItemId
    ? (items.find((item) => item.id === secondaryItemId) ?? null)
    : null;

  const currentReference = currentItem ? referenceFor(currentItem) : undefined;

  // A session-only item has no record to reference; its own object payload is
  // all there is, so it is sent as itself. An item WITH a record is never sent
  // as its payload (for a saved artifact that is only a pointer).
  const data = currentItem?.content.data;
  const canvasJson =
    !currentReference && data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;

  const title = currentItem ? resolveTitle(currentItem) : "";
  const secondaryReference = secondaryItem ? referenceFor(secondaryItem) : undefined;

  return createCanvasScope({
    current_canvas_item: currentReference,
    current_canvas_type: currentItem?.content.type,
    current_canvas_title: title || undefined,
    current_canvas_is_saved: !!currentReference,
    canvas_json: canvasJson,

    open_items: openItems,
    item_count: items.length,
    is_split: isSplit,
    secondary_canvas_item: secondaryReference,
    render_mode: renderMode,
  });
}
