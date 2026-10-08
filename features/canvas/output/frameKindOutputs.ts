"use client";

/**
 * How each frame / live artifact type prints and captures in its canvas tab
 * (rendered-output P2, census of artifact-output.ts). Each answer is a
 * handler or a short honest reason shown disabled in the pane menu — never a
 * blank page or a silent no-op. A body that knows more at run time (a cloud
 * browser's latest screenshot, a document's live text) offers it through
 * `useArtifactBodyOutput`, which wins over the reason here.
 */

import type { CanvasOutputRequest } from "@ai-matrx/canvas/react";
import { printElement } from "@ai-matrx/print/core";
import { captureRecordOnServer, viewerColorScheme } from "@/features/html-pages/capture/renderedCapture";
import { canvasHtmlItem } from "./attachOptions";
import { captureLeafletMap, findLeafletMap } from "./mapCapture";
import { printCapturedImage, printMonospaceText } from "./printCapture";
import { contentOf, readArtifactItemData } from "@/features/canvas/host/artifactItem";
import { EMBEDDED_SITE_CAPTURE_REASON, EMBEDDED_SITE_REASON } from "./framePrinters";

type Print = (request: CanvasOutputRequest) => void | Promise<void>;
type Capture = (request: CanvasOutputRequest) => Promise<Blob>;

/** An HTML page: the server's real browser renders its published page at the viewer's width. */
export const captureHtmlArtifact: Capture = async (request: CanvasOutputRequest) => {
  const item = canvasHtmlItem(request);
  if (!item?.saved) throw new Error("this page is still being published — try again in a moment");
  const record = await item.resolveRecord();
  if (!record) throw new Error("this page is not published yet");
  const result = await captureRecordOnServer({
    ...record,
    width: request.element?.clientWidth || 1024,
    colorScheme: viewerColorScheme(),
    includeImage: true,
  });
  if (!result.image) throw new Error("the page capture returned no image");
  return result.image;
};

// ─── map (Leaflet) ───────────────────────────────────────────────────────────

const captureMap: Capture = async (request) => {
  const map = findLeafletMap(request.element);
  if (!map) throw new Error("the map is not on screen");
  return captureLeafletMap(map);
};

export const MAP_OUTPUT = {
  print: ((request) => printCapturedImage(() => captureMap(request), request.title)) satisfies Print,
  capture: captureMap,
};

// ─── sandbox (terminal · files · activity — all DOM) ─────────────────────────

/** The terminal's scrollback as monospaced text when the Terminal view is showing; else the view as drawn. */
const printSandbox: Print = (request) => {
  const element = request.element;
  if (!element) throw new Error("the sandbox is not on screen");
  const buffer = [...element.querySelectorAll<HTMLElement>("[data-matrx-terminal-buffer]")].find(
    (node) => node.offsetParent !== null,
  );
  if (buffer) printMonospaceText(buffer.innerText.trimEnd() || "(the terminal is empty)", request.title);
  else printElement(element, { title: request.title });
};

export const SANDBOX_OUTPUT = { print: printSandbox };

// ─── code_preview (a Monaco diff — virtualised, so a DOM copy holds only the lines on screen) ──

/** The proposed code in full, with the explanation, as vector text. */
const printCodePreview: Print = (request) => {
  const stored = readArtifactItemData(request.item.data);
  const data = stored ? (contentOf(stored).data as { modifiedCode?: unknown; explanation?: unknown } | null) : null;
  const code = typeof data?.modifiedCode === "string" ? data.modifiedCode : null;
  if (code === null) {
    if (!request.element) throw new Error("the code preview is not on screen");
    printElement(request.element, { title: request.title });
    return;
  }
  const explanation = typeof data?.explanation === "string" && data.explanation.trim() ? `${data.explanation.trim()}\n\n` : "";
  printMonospaceText(`${explanation}${code}`, request.title);
};

export const CODE_PREVIEW_OUTPUT = { print: printCodePreview };

// ─── reasons a type cannot print/capture until its body offers more ─────────

export const IFRAME_OUTPUT = { print: EMBEDDED_SITE_REASON, capture: EMBEDDED_SITE_CAPTURE_REASON };

/** Shown until the browser body has a screenshot to offer. */
export const CLOUD_BROWSER_OUTPUT = {
  print: "turn on Screenshots first",
  capture: "turn on Screenshots first",
};

/** Shown until the document editor has opened (its body then prints its text and captures its page). */
export const UDT_DOCUMENT_OUTPUT = {
  print: "the document is still opening",
  capture: "the document is still opening",
};
