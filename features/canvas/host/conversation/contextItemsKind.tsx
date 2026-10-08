"use client";

/**
 * A chip host's attachments as a canvas tab — the chat package's
 * ContextItemViewer, paging through the host's items in place (‹ 2/3 ›).
 * ONE tab per chip host (a sent message's strip, the composer's resources, a
 * conversation's attached documents), keyed by it; a chip toggles it through
 * the chat canvas port's `useTab` (`contextItemsTab.ts`). The kind id lives in
 * the chat package (`host/canvas-tabs.ts`). Items carry what each body needs
 * (refs, the sent payload); the icon is re-resolved from the registry.
 */

import { Paperclip } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { CONTEXT_ITEMS_KIND } from "@ai-matrx/chat/host/canvas-tabs";
import { canvasRecord } from "@/features/canvas/host/toolCanvas";

export { CONTEXT_ITEMS_KIND };

/** Light check (the registry loads with the body): the tab carries a non-empty list. */
function hasItems(data: CanvasJson | undefined | null): boolean {
  const items = canvasRecord(data).items;
  return Array.isArray(items) && items.length > 0;
}

export const contextItemsKind = defineCanvasKind<CanvasJson>({
  id: CONTEXT_ITEMS_KIND,
  surface: "dom",
  label: "Attachment",
  icon: Paperclip,
  load: () => import("./ContextItemsCanvasView"),
  unavailable: (data) => (hasItems(data) ? null : "No attachments"),
  // The list is a copy of the chip host's; the host re-sends it on every press.
  restore: false,
});
