"use client";

/**
 * Every artifact type's print adapter, in `@ai-matrx/print`'s ONE block-printer
 * registry (keyed by artifact type AND `__kind`). Two callers, one adapter:
 * the block's / canvas tab's own Print, and a message's Print (each embedded
 * block printed through `toPrintHtml`). Imported for its side effect by the
 * canvas host and the print actions.
 */

import { registerBlockPrinter, type BlockPrinter } from "@ai-matrx/print/core";
import { flashcardsPrinter } from "@ai-matrx/print/flashcards";
import { quizPrinter } from "@/components/mardown-display/blocks/quiz/quiz-printer";
import { mathPrinter } from "@/components/mardown-display/blocks/math/math-printer";
import { blobToDataUrl, capturePage, hasPageCaptureEngine, PAGE_IMAGE_UNAVAILABLE } from "@/features/canvas/output/capturePort";
import { printPublishedPage } from "@/features/canvas/output/printPage";
import { resolvePrintablePageUrl } from "@/features/canvas/output/publishedPage";

const FENCED = /^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?\s*\1\s*$/;

/** An html block's page source (an `<artifact>` body may wrap it in a fence). */
export function htmlBlockSource(raw: string): string {
  const fenced = FENCED.exec(raw);
  return (fenced ? fenced[2] : raw) ?? "";
}

/**
 * An HTML page is a FRAME kind: its own print is the page printing itself
 * (`/p/<id>?print=1`); inside a message it is a picture of the page — a print
 * window runs no author scripts — or, until the capture engine is plugged, an
 * honest stand-in that names the sharp path.
 */
export const htmlPagePrinter: BlockPrinter = {
  label: "Print page",
  variants: [],
  print(data: unknown) {
    const pageUrl = typeof data === "object" && data && "pageUrl" in data ? String((data as { pageUrl: unknown }).pageUrl) : null;
    printPublishedPage({ pageUrl });
  },
  async toPrintHtml(_data, context) {
    if (!hasPageCaptureEngine()) return { notice: PAGE_IMAGE_UNAVAILABLE };
    // The block's own version (an `<artifact id>`) → its published page → an exact picture of it.
    const pageUrl = await resolvePrintablePageUrl({ canvasItemId: context.attributes?.id ?? null, version: "self" });
    const image = await capturePage(pageUrl ? { pageUrl } : { html: htmlBlockSource(context.raw) });
    if (!image) return { notice: PAGE_IMAGE_UNAVAILABLE };
    return { image: { src: await blobToDataUrl(image), alt: context.title || "Web page" } };
  },
};

registerBlockPrinter(["flashcards", "flashcard_set"], flashcardsPrinter);
registerBlockPrinter(["quiz", "quiz_set"], quizPrinter);
registerBlockPrinter(["math_problem"], mathPrinter);
registerBlockPrinter(["html"], htmlPagePrinter);
