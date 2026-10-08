"use client";

/**
 * A conversation's working-document version history as a canvas tab — the chat
 * package's WorkingDocumentVersionHistory (durable versions, compare any two,
 * Restore). ONE tab per conversation, keyed by its id; the document's History
 * button toggles it through the chat canvas port's `useTab`, pressed while it
 * is in front. The kind id lives in the chat package (`host/canvas-tabs.ts`).
 */

import { History } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { WORKING_DOCUMENT_HISTORY_KIND } from "@ai-matrx/chat/host/canvas-tabs";
import { canvasText } from "@/features/canvas/host/toolCanvas";

export { WORKING_DOCUMENT_HISTORY_KIND };

export const workingDocumentHistoryKind = defineCanvasKind<CanvasJson>({
  id: WORKING_DOCUMENT_HISTORY_KIND,
  surface: "dom",
  label: "Document history",
  icon: History,
  load: () => import("./WorkingDocumentHistoryCanvasView"),
  unavailable: (data) => (canvasText(data, "conversationId") ? null : "No document"),
  // Versions are rows: the tab comes back after a reload and reads them again.
  restore: true,
});
