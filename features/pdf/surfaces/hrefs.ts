import type { PdfSurfaceLinkIds } from "./registry";

/**
 * Extractor destination for either half of the PDF identity pair.
 * An unprocessed file keeps its durable file id so the route can create the
 * missing processed-document bridge without asking for another upload.
 */
export function buildPdfExtractorHref(ids: PdfSurfaceLinkIds): string {
  if (ids.processedDocumentId) {
    return `/tools/pdf-extractor/${ids.processedDocumentId}`;
  }
  if (ids.fileId) {
    return `/tools/pdf-extractor?file=${encodeURIComponent(ids.fileId)}`;
  }
  return "/tools/pdf-extractor";
}
