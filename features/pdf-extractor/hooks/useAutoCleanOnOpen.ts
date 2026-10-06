/**
 * Opening a doc that has extracted text but no clean text runs the AI clean
 * once — a doc reached from Knowledge or a Files link would otherwise sit with
 * an empty Clean pane and nothing started it. Once per doc per session, so a
 * failed run never loops; docs the upload stream handles are marked up front.
 */
import { useEffect } from "react";
import type { PdfDocument } from "./usePdfExtractor";

const handledDocIds = new Set<string>();

/** This doc's clean is owned elsewhere (e.g. the upload stream) — never auto-run. */
export function markAutoCleanHandled(docId: string): void {
  handledDocIds.add(docId);
}

/** Test seam: forget every handled doc. */
export function resetAutoCleanHandled(): void {
  handledDocIds.clear();
}

export function needsAutoClean(
  doc: PdfDocument | null,
  opts: { busy: boolean; pagesSettled: boolean; pagesHaveCleanText: boolean },
): boolean {
  if (!doc || opts.busy || !opts.pagesSettled || opts.pagesHaveCleanText) {
    return false;
  }
  if (handledDocIds.has(doc.id)) return false;
  const hasText = Boolean(doc.content && doc.content.trim());
  const hasClean = Boolean(doc.cleanContent && doc.cleanContent.trim());
  return hasText && !hasClean;
}

export function useAutoCleanOnOpen(args: {
  doc: PdfDocument | null;
  busy: boolean;
  pagesSettled: boolean;
  pagesHaveCleanText: boolean;
  run: () => void;
}): void {
  const { doc, busy, pagesSettled, pagesHaveCleanText, run } = args;
  const should = needsAutoClean(doc, { busy, pagesSettled, pagesHaveCleanText });
  useEffect(() => {
    if (!should || !doc) return;
    handledDocIds.add(doc.id);
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per doc
  }, [should, doc?.id]);
}
