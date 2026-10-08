"use client";

/**
 * Printing a picture or a text form of a live surface. The print window opens
 * NOW (inside the click, where popup blockers allow it) and is written when
 * the picture is ready — never a silent no-op: a failed capture prints the
 * reason in the page's place and rethrows for the menu's error toast.
 */

import { buildPrintDocument, openPendingPrintWindow, printBlockOutputHtml, printHtmlContent } from "@ai-matrx/print/core";
import { escapeHtml } from "@ai-matrx/kit/html-escape";
import { blobToDataUrl } from "./capturePort";

export function printCapturedImage(capture: () => Promise<Blob>, title: string): Promise<void> {
  const pending = openPendingPrintWindow(title);
  return (async () => {
    try {
      const image = await capture();
      const body = printBlockOutputHtml({ image: { src: await blobToDataUrl(image), alt: title } });
      pending.write(buildPrintDocument(body, title, "img{max-width:100%;height:auto}"));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "the picture could not be made";
      pending.write(buildPrintDocument(printBlockOutputHtml({ notice: `Nothing to print: ${reason}.` }), title));
      throw error;
    }
  })();
}

/** Monospaced text (a terminal's buffer), printed as vector text. */
export function printMonospaceText(text: string, title: string): void {
  printHtmlContent(
    `<h1>${escapeHtml(title)}</h1><pre class="matrx-terminal-print">${escapeHtml(text)}</pre>`,
    title,
    ".matrx-terminal-print{white-space:pre-wrap;word-break:break-word;font:10pt/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;border:1px solid #cbd5e1;border-radius:6px;padding:10px;background:#f8fafc}",
  );
}
