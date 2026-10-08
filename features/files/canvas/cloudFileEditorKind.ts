"use client";

/**
 * A cloud file's text editor as a canvas tab — the existing
 * `CloudFileInlineEditor` (Monaco, Save = a new version of the same file,
 * flush on unmount so closing the tab never drops typed text). ONE tab per
 * file (`cloud-file-editor`, keyed by the file id); a preview's Edit action
 * opens or focuses it.
 */

import { FileCode } from "lucide-react";
import type { CanvasController, CanvasJson } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { canvasText, openToolInCanvas } from "@/features/canvas/host/toolCanvas";

export const CLOUD_FILE_EDITOR_KIND = "cloud-file-editor";

export function readCloudFileEditorTab(data: CanvasJson | undefined | null): { fileId: string } | null {
  const fileId = canvasText(data, "fileId");
  return fileId ? { fileId } : null;
}

/** Opens (or focuses) the file's editor tab; announces when no canvas can show it. */
export function openCloudFileEditor(canvas: CanvasController | null, fileId: string, fileName: string) {
  return openToolInCanvas(canvas, {
    kind: CLOUD_FILE_EDITOR_KIND,
    key: fileId,
    title: fileName || "Edit file",
    data: { fileId },
  });
}

export const CLOUD_FILE_EDITOR_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<CanvasJson>({
  id: CLOUD_FILE_EDITOR_KIND,
  surface: "dom",
  label: "Edit file",
  icon: FileCode,
  load: () => import("./CloudFileEditorCanvasView"),
  unavailable: (data) => (readCloudFileEditorTab(data) ? null : "No file"),
  restore: true,
});
