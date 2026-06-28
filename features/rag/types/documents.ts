/**
 * features/rag/types/documents.ts
 *
 * Wire shapes for the unified document API at /api/document/*.
 *
 * Mirror of the Pydantic response models defined in
 * `aidream/api/routers/document.py`. Keep in sync — fields added on the
 * Python side must land here too, otherwise consumers won't get types.
 *
 * Backed by:
 *   - docproc.processed_documents     (Phase 4A)
 *   - docproc.processed_document_pages (Phase 4A)
 *   - rag.kg_chunks (with FK to processed_documents) (Phase 4A/4B)
 */

export type DocumentSourceKind =
  | "cld_file"
  | "note"
  | "code_file"
  | "external_url"
  | "inline"
  | "legacy";

export type DocumentDerivationKind =
  | "initial_extract"
  | "re_extract"
  | "re_clean"
  | "re_chunk"
  | "merge_processings"
  | "legacy_import";

export interface DocumentLineage {
  binary_parent_file_id: string | null;
  binary_parent_kind: string | null;
  binary_parent_metadata: Record<string, unknown> | null;
  processing_parent_id: string | null;
  processing_parent_kind: string | null;
}

export interface PageSummary {
  page_index: number;
  page_number: number;
  width: number | null;
  height: number | null;
  rotation: number | null;
  raw_char_count: number;
  cleaned_char_count: number;
  section_kind: string | null;
  section_title: string | null;
  extraction_method: string | null;
  used_ocr: boolean;
  has_image: boolean;
}

export interface DocumentDetail {
  id: string;
  owner_id: string;
  organization_id: string | null;
  name: string;
  mime_type: string | null;
  total_pages: number | null;
  source_kind: DocumentSourceKind;
  source_id: string;
  derivation_kind: DocumentDerivationKind;
  storage_uri: string | null;
  created_at: string;
  updated_at: string;
  has_structured_json: boolean;
  has_clean_content: boolean;
  raw_content_chars: number;
  clean_content_chars: number;
  chunk_count: number;
  section_histogram: Record<string, number>;
  pages: PageSummary[];
  lineage: DocumentLineage | null;
}

/** Bounding-box block from PdfTextBlock (System A). */
export interface PdfBlock {
  block_number: number;
  block_type: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
}

/** Word from PdfTextWord (System A). */
export interface PdfWord {
  word: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  block_number: number;
  line_number: number;
  word_number: number;
}

export interface PageDetail {
  page_index: number;
  page_number: number;
  width: number | null;
  height: number | null;
  rotation: number | null;
  raw_text: string;
  cleaned_text: string;
  section_kind: string | null;
  section_title: string | null;
  is_continuation: boolean;
  used_ocr: boolean;
  extraction_method: string | null;
  blocks: PdfBlock[] | null;
  words: PdfWord[] | null;
  chunk_ids: string[];
  /** Pre-resolved signed URL to the cached page image (PNG). */
  image_url: string | null;
}

export interface PageSpan {
  page_index: number;
  page_number: number;
}

export interface ChunkRow {
  chunk_id: string;
  chunk_index: number;
  chunk_kind: string;
  parent_chunk_id: string | null;
  primary_page_id: string | null;
  page_numbers: number[] | null;
  page_spans: PageSpan[] | null;
  content_text: string;
  token_count: number | null;
  section_kind: string | null;
}

export interface LineageNode {
  id: string;
  kind: "cld_files" | "processed_document";
  label: string | null;
  derivation_kind: string | null;
  derivation_metadata: Record<string, unknown> | null;
  created_at: string | null;
}

export interface LineageTree {
  document_id: string;
  binary_ancestors: LineageNode[];
  binary_descendants: LineageNode[];
  processing_ancestors: LineageNode[];
  processing_descendants: LineageNode[];
}
