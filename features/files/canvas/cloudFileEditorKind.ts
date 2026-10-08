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
import { defineCanvasKind, type AnyCanvasKind, type CanvasOutputRequest } from "@ai-matrx/canvas/react";
import { buildPrintDocument, openPendingPrintWindow } from "@ai-matrx/print/core";
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

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Print = the WHOLE file's text (the working copy, unsaved edits included) in
 * monospace — Monaco virtualizes its lines, so a DOM copy of the pane would
 * print only the screenful that is drawn.
 */
async function printFileText(request: CanvasOutputRequest): Promise<void> {
  // The print window opens inside the click; the working copy (a heavy module) loads after.
  const pending = openPendingPrintWindow(request.title);
  const fileId = readCloudFileEditorTab(request.item.data)?.fileId;
  const { fileWorkingCopy } = await import("@/features/files/redux/working-copy");
  const text = fileId ? fileWorkingCopy.entry(fileId)?.value : undefined;
  if (text === undefined) {
    pending.write(buildPrintDocument("<p>The file's text has not loaded yet. Close this window and print again.</p>", request.title));
    throw new Error("the file's text has not loaded yet");
  }
  pending.write(
    buildPrintDocument(
      `<pre class="matrx-file-text">${escapeHtml(text)}</pre>`,
      request.title,
      `.matrx-file-text{margin:0;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2}`,
    ),
  );
}

/** Capture = the editor as drawn (the visible lines — Monaco draws no others); the full text is Print. */
async function captureVisibleEditor(request: CanvasOutputRequest): Promise<Blob> {
  if (!request.element) throw new Error("the editor is not on screen");
  const { elementToImage } = await import("@ai-matrx/alchemy/operate/capture");
  return elementToImage(request.element, { safeColors: true });
}

export const CLOUD_FILE_EDITOR_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<CanvasJson>({
  id: CLOUD_FILE_EDITOR_KIND,
  surface: "dom",
  label: "Edit file",
  print: printFileText,
  capture: captureVisibleEditor,
  icon: FileCode,
  load: () => import("./CloudFileEditorCanvasView"),
  unavailable: (data) => (readCloudFileEditorTab(data) ? null : "No file"),
  restore: true,
});
