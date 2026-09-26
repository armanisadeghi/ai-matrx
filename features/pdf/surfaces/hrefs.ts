import type { PdfSurfaceLinkIds } from "./registry";

/**
 * Extractor destination for either half of the PDF identity pair.
 * An unprocessed file keeps its durable file id so the route can create the
 * missing processed-document bridge without asking for another upload.
 *
 * A control labelled "PDF Extractor" opens the PDF Extractor. A processed
 * document's HOME is its Source screen (SOURCE-CONVERGENCE §8.2, reached via
 * `buildSourceHref`), but the PDF tools stay at `/tools/pdf-extractor?doc=<id>`
 * — sending this link to /knowledge/sources made every "Open in PDF Extractor"
 * land on Knowledge once the 2026-09-26 files backfill gave every file a
 * processed document.
 */
export function buildPdfExtractorHref(ids: PdfSurfaceLinkIds): string {
  if (ids.processedDocumentId) {
    return `/tools/pdf-extractor?doc=${encodeURIComponent(ids.processedDocumentId)}`;
  }
  if (ids.fileId) {
    return `/tools/pdf-extractor?file=${encodeURIComponent(ids.fileId)}`;
  }
  return "/tools/pdf-extractor";
}

/** The processed document's home: its Source screen in Knowledge. */
export function buildSourceHref(ids: PdfSurfaceLinkIds): string | null {
  return ids.processedDocumentId
    ? `/knowledge/sources/${encodeURIComponent(ids.processedDocumentId)}`
    : null;
}
