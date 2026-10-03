"use client";

/**
 * A document's or a workbook's snapshot history as a canvas tab — the existing
 * `DocumentHistoryViewer` / `WorkbookHistoryViewer`, beside the editor. One
 * tab per document (`document-history`, keyed by the document id) and per
 * workbook (`workbook-history`, keyed by the workbook id); the editor's
 * History button toggles it. Restore writes a new snapshot and the editor's
 * realtime hook picks it up, so the tab needs nothing from the editor.
 */

import { History } from "lucide-react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { canvasRecord, canvasText, type ToolToggleInput } from "@/features/canvas/host/toolCanvas";

export const DOCUMENT_HISTORY_KIND = "document-history";
export const WORKBOOK_HISTORY_KIND = "workbook-history";

export interface HistoryTabData {
  id: string;
  editable: boolean;
}

export function readHistoryTab(data: CanvasJson | undefined | null): HistoryTabData | null {
  const id = canvasText(data, "id");
  if (!id) return null;
  return { id, editable: canvasRecord(data).editable !== false };
}

export function documentHistoryToggleInput(documentId: string, editable: boolean): ToolToggleInput {
  return { kind: DOCUMENT_HISTORY_KIND, key: documentId, title: "Document history", data: { id: documentId, editable } };
}

export function workbookHistoryToggleInput(workbookId: string, editable: boolean): ToolToggleInput {
  return { kind: WORKBOOK_HISTORY_KIND, key: workbookId, title: "Workbook history", data: { id: workbookId, editable } };
}

export const DOCUMENT_HISTORY_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<CanvasJson>({
  id: DOCUMENT_HISTORY_KIND,
  label: "Document history",
  icon: History,
  load: () => import("./DocumentHistoryCanvasView"),
  unavailable: (data) => (readHistoryTab(data) ? null : "No document"),
  restore: true,
});

export const WORKBOOK_HISTORY_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<CanvasJson>({
  id: WORKBOOK_HISTORY_KIND,
  label: "Workbook history",
  icon: History,
  load: () => import("./WorkbookHistoryCanvasView"),
  unavailable: (data) => (readHistoryTab(data) ? null : "No workbook"),
  restore: true,
});
