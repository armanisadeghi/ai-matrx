/**
 * Opening a doc that has extracted text but no clean text runs the AI clean
 * once — a doc reached from Knowledge or a Files link would otherwise sit with
 * an empty Clean pane and nothing started it. Once per doc per session, so a
 * failed run never loops; docs the upload stream handles are marked up front.
 * The server's run record (not a clock) says whether a run is already going.
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

/** Above this the server cleans per page (paid) — left to the manual button. */
export const AUTO_CLEAN_MAX_PAGES = 200;

export interface AutoCleanOpts {
  busy: boolean;
  pagesSettled: boolean;
  pagesHaveCleanText: boolean;
  /** Rows loaded for this doc — the page count when the doc row has none. */
  pageCount?: number;
  /** Any page already carries a section_kind (e.g. an all-illegible doc is "cleaned"). */
  pagesHaveSectionKind?: boolean;
  /**
   * The run record answered the by-link lookup (`usePdfDocRun().answered`).
   * Until it has, nothing is known about a server run — never auto-run.
   * A live / queued / failed run is reported through `busy`.
   */
  runAnswered: boolean;
}

function isPdfDoc(doc: PdfDocument): boolean {
  const mime = (doc.mimeType ?? "").toLowerCase();
  if (mime) return mime.includes("pdf");
  return /\.pdf$/i.test(doc.name.trim());
}

export function needsAutoClean(
  doc: PdfDocument | null,
  opts: AutoCleanOpts,
): boolean {
  if (!doc || opts.busy || !opts.runAnswered || !opts.pagesSettled || opts.pagesHaveCleanText) {
    return false;
  }
  if (handledDocIds.has(doc.id)) return false;
  if (!isPdfDoc(doc)) return false;
  if (opts.pagesHaveSectionKind) return false;
  const pages = doc.totalPages ?? opts.pageCount ?? 0;
  if (pages > AUTO_CLEAN_MAX_PAGES) return false;
  const hasText = Boolean(doc.content && doc.content.trim());
  const hasClean = Boolean(doc.cleanContent && doc.cleanContent.trim());
  return hasText && !hasClean;
}

export function useAutoCleanOnOpen(args: {
  doc: PdfDocument | null;
  busy: boolean;
  pagesSettled: boolean;
  pagesHaveCleanText: boolean;
  pageCount?: number;
  pagesHaveSectionKind?: boolean;
  runAnswered: boolean;
  run: () => void;
}): void {
  const { doc, run, ...rest } = args;
  const should = needsAutoClean(doc, rest);
  useEffect(() => {
    if (!should || !doc) return;
    handledDocIds.add(doc.id);
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per doc
  }, [should, doc?.id]);
}
