/**
 * Surface manifest — Documents viewer (`matrx-user/documents`).
 *
 * The document viewer / library preview (route `/rag/viewer/[id]`). The user
 * reads a processed document — PDF, markdown, text, or transcript-style media
 * — page by page, with extracted text and RAG chunks available alongside.
 *
 * Agents bound here operate on the page the user is reading, a selected
 * passage, a specific chunk, or the whole document. Useful for summarize,
 * extract, translate, and Q&A-over-document actions.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Document identity (300-329) ───────────────────────────────────────
  {
    name: "document_id",
    label: "Document ID",
    description:
      "UUID of the document being viewed. Empty when no document is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "document_title",
    label: "Document title",
    description:
      "Display title or filename of the open document. Empty when no document is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 310,
  },
  {
    name: "document_type",
    label: "Document type",
    description:
      'Kind of document: "pdf", "markdown", "txt", "video", etc. Empty when unknown or no document is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 320,
  },
  {
    name: "document_metadata",
    label: "Document metadata",
    description:
      "Object with title, created_at, source_url, processing_status, and other document-level metadata. Empty object when none or no document is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 325,
  },

  // ── Page / scope mirror (340-369) ─────────────────────────────────────
  {
    name: "current_page_number",
    label: "Current page number",
    description:
      "1-indexed page the user is currently viewing in a multi-page document. Zero when single-page or no document is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 340,
  },
  {
    name: "current_page_text",
    label: "Current page text",
    description:
      "Extracted text of the page the user is currently viewing. Empty when text isn't available or no document is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 345,
  },
  {
    name: "page_count",
    label: "Page count",
    description:
      "Total number of pages in the open document. Zero when single-page or no document is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 350,
  },
  {
    name: "full_document_text",
    label: "Full document text",
    description:
      "Entire extracted text of the document, all pages joined. Can be very large — bind with care. Empty when not available or no document is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    sortOrder: 355,
  },

  // ── Chunk dimension (RAG) (370-389) ───────────────────────────────────
  {
    name: "current_chunk_id",
    label: "Current chunk ID",
    description:
      "ID of the RAG chunk the user has focused or selected. Empty when no chunk is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 370,
  },
  {
    name: "current_chunk_text",
    label: "Current chunk text",
    description:
      "Text body of the focused RAG chunk. Empty when no chunk is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 375,
  },
  {
    name: "chunk_list",
    label: "All chunks",
    description:
      "Array of `{ id, text, metadata }` for every RAG chunk in the document, in order. Empty array when the document has no chunks.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 380,
  },
];

export const documentsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/documents",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createDocumentsScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  document_id?: string;
  document_title?: string;
  document_type?: string;
  document_metadata?: Record<string, unknown>;
  current_page_number?: number;
  current_page_text?: string;
  page_count?: number;
  full_document_text?: string;
  current_chunk_id?: string;
  current_chunk_text?: string;
  chunk_list?: Array<{ id: string; text: string; metadata?: Record<string, unknown> }>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
