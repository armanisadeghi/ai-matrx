/**
 * features/pdf/surfaces/registry.ts
 *
 * THE registry of PDF interaction surfaces. Every UI that renders a PDF
 * mounts <PdfSurfaceSwitcher> (features/pdf/components), which reads this
 * registry — so from any surface, every other surface for the SAME document
 * is one click away. Adding a new surface = one entry here; every mounted
 * switcher picks it up.
 *
 * Identity model: a PDF lives as a cld_files row (fileId) and/or a
 * processed_documents row (processedDocumentId), linked by
 * cld_files.canonical_processed_document_id (backfilled + trigger-maintained
 * since 2026-06-11). `usePdfSurfaceLinks` resolves whichever half a surface
 * doesn't already know.
 */

import type { LucideIcon } from "lucide-react";
import {
  FileText,
  Microscope,
  Wand2,
  Database,
} from "lucide-react";

export type PdfSurfaceId =
  | "file-viewer"
  | "analysis-studio"
  | "extractor-studio"
  | "rag-library";

export interface PdfSurfaceLinkIds {
  fileId: string | null;
  processedDocumentId: string | null;
}

export interface PdfSurfaceDef {
  id: PdfSurfaceId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Absolute app href for this surface, or null when not reachable for
   *  this document (entry is hidden). */
  buildHref(ids: PdfSurfaceLinkIds): string | null;
}

export const PDF_SURFACES: PdfSurfaceDef[] = [
  {
    id: "file-viewer",
    label: "File viewer",
    description: "Preview, share, versions",
    icon: FileText,
    buildHref: ({ fileId }) => (fileId ? `/files/f/${fileId}` : null),
  },
  {
    id: "analysis-studio",
    label: "Analysis Studio",
    description: "Pages, detectors, annotations, redaction",
    icon: Microscope,
    buildHref: ({ fileId }) => (fileId ? `/files/f/${fileId}/studio` : null),
  },
  {
    id: "extractor-studio",
    label: "PDF Extractor",
    description: "Extract, AI clean, manipulate, chunk",
    icon: Wand2,
    // Without a processed doc the extractor home still lets the user start
    // an extraction — better one click to the right tool than a dead entry.
    buildHref: ({ processedDocumentId }) =>
      processedDocumentId
        ? `/tools/pdf-extractor/${processedDocumentId}`
        : `/tools/pdf-extractor`,
  },
  {
    id: "rag-library",
    label: "Knowledge library",
    description: "RAG documents built from this file",
    icon: Database,
    buildHref: ({ processedDocumentId }) =>
      processedDocumentId ? `/rag/library` : null,
  },
];
