/**
 * Surface manifest — Knowledge Document Viewer (`matrx-user/rag-viewer`).
 *
 * `/rag/viewer/[id]` — the read surface for ONE processed document
 * (`docproc.processed_documents`), rendered by `LibraryPreviewPage`: a page
 * index on the left, the selected page's extracted text (cleaned or raw) in
 * the middle, and the document's segments plus in-document search results on
 * the right.
 *
 * This is where a citation lands. `/rag/search` hits, chat tool cards, and the
 * `/files/f/[id]` redirect for shared-library grant readers all deep-link here
 * with `?page=<n>`, so the surface's job is to hand an agent the passage the
 * user is actually looking at, with enough identity to cite it back.
 *
 * PROVENANCE NOTE — `documents.manifest.ts` used to describe exactly this
 * surface (a RAG viewer at `/rag/viewer/[id]` with pages, extracted text, and
 * chunks) while being wired to `/documents`, the unrelated Univer cloud-docs
 * feature. Those values were fiction there. This manifest is where they
 * belong, declared against the component that really loads them. See that
 * file's 2026-07-27 rewrite note.
 *
 * Emitter: `features/rag/components/library/LibraryPreviewPage.tsx` via
 * `buildRagViewerContextData` in
 * `features/rag/agent-context/buildRagViewerContextData.ts`. The page-text
 * pane pushes its loaded page up through `onActivePageLoaded` so the route can
 * emit it — without that lift, the page text would be declared and unemitted.
 *
 * ROUTED IDENTITY: `document_id` comes from the route param, so it is the one
 * value this surface can truly guarantee. Everything derived from the document
 * fetch is optional — the load can be in flight, denied, or 404.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "viewer_document",
    label: "Open document",
    sortOrder: 100,
    description:
      "Identity and lineage of the processed document being viewed, and the source it was extracted from.",
  },
  {
    key: "viewer_pipeline",
    label: "Processing state",
    sortOrder: 200,
    description:
      "How far this document got through extract → clean → segment → embed, and therefore how much of it is retrievable.",
  },
  {
    key: "viewer_page",
    label: "Active page",
    sortOrder: 300,
    description:
      "The page the user is reading right now, including its extracted text. This is the passage an agent should reason about by default.",
  },
  {
    key: "viewer_segments",
    label: "Segments",
    sortOrder: 400,
    description:
      "The retrievable segments this document was split into — what RAG search actually matches against.",
  },
  {
    key: "viewer_search",
    label: "In-document search",
    sortOrder: 500,
    description:
      "The lexical search the user ran against this one document, and where its matches landed.",
  },
  {
    key: "viewer_access",
    label: "Access",
    sortOrder: 600,
    description:
      "Which data stores this document is bound into, and why a shared-library reader can see it.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Open document (300-349) ───────────────────────────────────────────
  {
    name: "document_id",
    label: "Document ID",
    description:
      "UUID of the `processed_documents` row being viewed, taken from the route. Always present — this surface cannot mount without it. It is the id to cite and the id to pass to document tools.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "viewer_document",
    sortOrder: 300,
  },
  {
    name: "document_name",
    label: "Document name",
    description:
      "Display name of the document (usually the source file's name). Empty while the document is still loading, or when the load failed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "viewer_document",
    sortOrder: 305,
  },
  {
    name: "document_load_status",
    label: "Document load status",
    description:
      '"loading", "loaded", or "error" — the state of the document fetch. Always present. "error" means the caller could not read this document; do not claim anything about its contents.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    group: "viewer_document",
    sortOrder: 308,
  },
  {
    name: "source_kind",
    label: "Source kind",
    description:
      '"cld_file", "note", "code_file", "transcript", … — what kind of thing was processed into this document. Empty until the document loads.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "viewer_document",
    sortOrder: 310,
  },
  {
    name: "source_id",
    label: "Source ID",
    description:
      "Durable UUID of the source this document was extracted FROM — for `cld_file` sources this is the `files.files` id. Resolve those bytes through the platform file handler by id; this surface never emits a URL. Empty until the document loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "viewer_document",
    sortOrder: 315,
  },
  {
    name: "document_mime_type",
    label: "Document MIME type",
    description:
      'MIME type of the source, e.g. "application/pdf". Empty for sources that have none, and until the document loads.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "viewer_document",
    sortOrder: 320,
  },
  {
    name: "derivation_kind",
    label: "Derivation kind",
    description:
      'How this document was derived — "initial_extract" for the canonical extraction, or a derivation name for a document produced from another one. Empty until the document loads.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    group: "viewer_document",
    sortOrder: 325,
  },
  {
    name: "parent_document_id",
    label: "Parent document ID",
    description:
      "UUID of the processed document this one was derived from. Empty for a canonical extraction (the common case) and until the document loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "viewer_document",
    sortOrder: 330,
  },
  {
    name: "document_created_at",
    label: "Document created at",
    description:
      "ISO-8601 timestamp of when this extraction run was recorded. Empty until the document loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "viewer_document",
    sortOrder: 335,
  },
  {
    name: "document_updated_at",
    label: "Document updated at",
    description:
      "ISO-8601 timestamp of the last pipeline change to this document. Empty until the document loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "viewer_document",
    sortOrder: 340,
  },
  {
    name: "document_summary",
    label: "Document summary",
    description:
      "Composite for the open document: `{ id, name, status, source_kind, source_id, mime_type, derivation_kind, parent_processed_id, total_pages, pages_persisted, segments, embeddings_voyage, created_at, updated_at }`. Absent until the document loads.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 480,
    group: "viewer_document",
    sortOrder: 345,
  },

  // ── Processing state (350-389) ────────────────────────────────────────
  {
    name: "document_status",
    label: "Pipeline status",
    description:
      '"ready", "embedding", "chunking", "extracted", "pending", or "unknown". Only "ready" means every segment is embedded and the whole document is retrievable. Empty until the document loads.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9,
    group: "viewer_pipeline",
    sortOrder: 350,
  },
  {
    name: "total_pages",
    label: "Total pages",
    description:
      "Page count reported by the source document. Absent for sources with no page concept, and until the document loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "viewer_pipeline",
    sortOrder: 355,
  },
  {
    name: "pages_persisted",
    label: "Pages persisted",
    description:
      "How many pages were actually extracted and stored. Below total_pages means extraction is incomplete and parts of the document are simply not there. Absent until the document loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "viewer_pipeline",
    sortOrder: 360,
  },
  {
    name: "segment_count",
    label: "Segment count",
    description:
      "How many retrievable segments this document was split into. 0 means it has been extracted but not segmented, so RAG search cannot find it. Absent until the document loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "viewer_pipeline",
    sortOrder: 365,
  },
  {
    name: "embeddings_voyage",
    label: "Voyage embeddings",
    description:
      "Segments carrying a current voyage-4-large vector — the model live search uses. A number below segment_count means part of this document is unsearchable. Absent until the document loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "viewer_pipeline",
    sortOrder: 370,
  },
  {
    name: "embeddings_oai",
    label: "OpenAI embeddings",
    description:
      "Segments carrying a legacy OpenAI vector. Present for older documents; not what current search uses. Absent until the document loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "viewer_pipeline",
    sortOrder: 375,
  },
  {
    name: "has_structured_json",
    label: "Has structured extraction",
    description:
      "True when the pipeline stored a structured JSON extraction alongside the page text. Absent until the document loads.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "viewer_pipeline",
    sortOrder: 380,
  },

  // ── Active page (390-439) ─────────────────────────────────────────────
  {
    name: "active_page_number",
    label: "Active page number",
    description:
      "1-based number of the page the user is reading. Always present — the viewer always has a page selected, defaulting to 1 or to the `?page=` deep link a citation arrived with.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "viewer_page",
    sortOrder: 390,
  },
  {
    name: "page_text_view",
    label: "Page text view",
    description:
      '"cleaned" or "raw" — which extraction the user is reading. Cleaned text has been through LLM cleanup and section classification; raw is what the extractor produced. Empty until the page loads.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    group: "viewer_page",
    sortOrder: 395,
  },
  {
    name: "page_text",
    label: "Active page text",
    description:
      "Full extracted text of the active page, in whichever view the user selected (page_text_view says which). Empty while the page loads, and when the document has no persisted pages. This is the passage on screen — large, so bind it deliberately.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 3200,
    autoContext: false,
    group: "viewer_page",
    sortOrder: 400,
  },
  {
    name: "page_raw_text",
    label: "Active page raw text",
    description:
      "Unmodified extractor output for the active page, before LLM cleanup. Useful when the user asks what cleanup changed. Empty until the page loads. Large — bind deliberately.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 3400,
    autoContext: false,
    group: "viewer_page",
    sortOrder: 405,
  },
  {
    name: "page_section_title",
    label: "Active page section title",
    description:
      "Section heading the cleanup stage assigned to this page. Empty when the page was never classified, and until the page loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "viewer_page",
    sortOrder: 410,
  },
  {
    name: "page_section_kind",
    label: "Active page section kind",
    description:
      "Classified kind of the section this page belongs to. Empty when unclassified, and until the page loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    group: "viewer_page",
    sortOrder: 415,
  },
  {
    name: "page_extraction_method",
    label: "Page extraction method",
    description:
      "Which extractor produced this page's text. Together with page_used_ocr it tells you how much to trust the characters. Empty until the page loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    group: "viewer_page",
    sortOrder: 420,
  },
  {
    name: "page_used_ocr",
    label: "Page used OCR",
    description:
      "True when this page's text came from OCR rather than an embedded text layer — expect transcription errors and prefer verifying against the rendered page. Absent until the page loads.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "viewer_page",
    sortOrder: 425,
  },
  {
    name: "page_has_image",
    label: "Page has rendered image",
    description:
      "True when a rendered image of this physical page is stored and can be shown as visual evidence. Absent until the page loads.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "viewer_page",
    sortOrder: 430,
  },
  {
    name: "active_page",
    label: "Active page summary",
    description:
      "Composite for the page on screen WITHOUT its body text: `{ page_number, page_index, view, raw_char_count, cleaned_char_count, extraction_method, used_ocr, section_kind, section_title, is_continuation, has_image }`. Absent until the page loads.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "viewer_page",
    sortOrder: 435,
  },

  // ── Segments (440-469) ────────────────────────────────────────────────
  {
    name: "sample_segment_count",
    label: "Loaded segment count",
    description:
      "How many segment previews the viewer loaded (capped at 20 by the detail fetch — NOT the document's total, which is segment_count). Absent until the document loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "viewer_segments",
    sortOrder: 440,
  },
  {
    name: "sample_segments",
    label: "Loaded segments",
    description:
      "Array of `{ id, chunk_index, chunk_kind, token_count, page_numbers, has_voyage_embedding, content_preview }` for the segments the viewer loaded, in index order. A sample of the document, not all of it — never describe it as complete. Empty array when the document has no segments.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    group: "viewer_segments",
    sortOrder: 445,
  },

  // ── In-document search (470-499) ──────────────────────────────────────
  {
    name: "search_query",
    label: "In-document search query",
    description:
      "The query the user last ran against THIS document (the one currently highlighted in the page text). Empty when they have not searched.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "viewer_search",
    sortOrder: 470,
  },
  {
    name: "search_matched_pages",
    label: "Matched pages",
    description:
      "Sorted 1-based page numbers containing at least one match for search_query. Empty array when the search found nothing; absent when no search has run.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "viewer_search",
    sortOrder: 475,
  },
  {
    name: "search_match_count",
    label: "Matching segments",
    description:
      "How many segments of this document matched search_query. Absent when no search has run.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "viewer_search",
    sortOrder: 480,
  },
  {
    name: "search_top_snippet",
    label: "Best match snippet",
    description:
      "Text of the highest-ranked matching segment — the answer preview the summary banner shows. Empty when no search has run or nothing matched.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "viewer_search",
    sortOrder: 485,
  },
  {
    name: "search_results",
    label: "In-document search results",
    description:
      "Array of `{ chunk_id, page_numbers, rank, snippet }` for the ranked lexical hits inside this document, best first. Absent when no search has run. Large — bind deliberately.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    group: "viewer_search",
    sortOrder: 490,
  },

  // ── Access (500-529) ──────────────────────────────────────────────────
  {
    name: "document_data_stores",
    label: "Bound data stores",
    description:
      "Array of `{ data_store_id, name, kind, short_code }` for every data store this document is a member of. Empty array when it is bound to none — meaning no scoped retrieval will ever reach it. Absent until the document loads.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "viewer_access",
    sortOrder: 500,
  },
  {
    name: "document_provenance_label",
    label: "Why the caller has access",
    description:
      'Human explanation when the caller reads this document through a shared-library grant, e.g. "Shared library · via Workers Compensation". Empty for documents the caller owns — which is the common case.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 45,
    group: "viewer_access",
    sortOrder: 505,
  },
];

export const ragViewerManifest: SurfaceManifest = {
  surfaceName: "matrx-user/rag-viewer",
  readiness: "partial",
  readinessNote:
    "Manifest authored against the live /rag/viewer/[id] component and the emitter is wired via SurfaceRuntimeProvider (the page-text pane lifts its loaded page through onActivePageLoaded); not yet DB-synced and no live non-matching-name binding test run. The Knowledge Asset Builder drawer's derivation rollup stays undeclared — it loads inside KnowledgeAssetPanel and nothing lifts it to the route.",
  label: "Knowledge Document Viewer",
  urlPattern: "/rag/viewer/[id]",
  intro: `<surface_intro>
This is the read surface for ONE processed document — a source (usually a PDF)
that the RAG pipeline extracted into pages, cleaned, split into SEGMENTS, and
embedded. The user is reading it page by page. Citations from RAG search and
from chat tool cards land here, deep-linked to the cited page.

The passage in front of the user is page_text, on page active_page_number, in
the view named by page_text_view ("cleaned" = after LLM cleanup, "raw" = the
extractor's own output). Default to reasoning about that page. page_used_ocr
being true is a warning: the characters came from OCR and may be wrong, so
verify anything precise (numbers, names, citations) rather than asserting it.

document_status tells you how much of this document exists at all. "extracted"
means pages but no segments; "embedding" means vectors are still being written;
only "ready" means the whole document is retrievable. pages_persisted below
total_pages means parts of the document were never extracted — say so instead
of concluding the content is absent from the source.

sample_segments is a SAMPLE (capped), not the whole document. Never present it
as a complete inventory.

source_id is a durable id for the original source file. Resolve those bytes
through the platform file handler by id; this surface never emits a URL of any
kind, and any URL you may have seen for this content expires.

When you cite, cite document_id plus active_page_number — that pair is what
takes the user back to exactly what you read.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/** One loaded segment preview as this surface hands it to an agent. */
export interface RagViewerSegmentEntry {
  id: string;
  chunk_index: number | null;
  chunk_kind: string | null;
  token_count: number | null;
  page_numbers: number[] | null;
  has_voyage_embedding: boolean;
  content_preview: string;
}

/** One in-document lexical hit. */
export interface RagViewerSearchHitEntry {
  chunk_id: string | null;
  page_numbers: number[] | null;
  rank: number | null;
  snippet: string;
}

/** One data store this document is bound into. */
export interface RagViewerDataStoreEntry {
  data_store_id: string;
  name: string;
  kind: string;
  short_code: string | null;
}

/**
 * Scope builder for `matrx-user/rag-viewer`.
 *
 * `document_id`, `document_load_status`, and `active_page_number` are the only
 * guaranteed keys: the first two come from the route and the fetch state
 * machine, the third from viewer state that always holds a page. Everything
 * else depends on a load that may be in flight, denied, or empty.
 */
export function createRagViewerScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;

  document_id: string;
  document_load_status: string;
  active_page_number: number;

  // Open document
  document_name?: string;
  source_kind?: string;
  source_id?: string;
  document_mime_type?: string;
  derivation_kind?: string;
  parent_document_id?: string;
  document_created_at?: string;
  document_updated_at?: string;
  document_summary?: Record<string, unknown>;

  // Processing state
  document_status?: string;
  total_pages?: number;
  pages_persisted?: number;
  segment_count?: number;
  embeddings_voyage?: number;
  embeddings_oai?: number;
  has_structured_json?: boolean;

  // Active page
  page_text_view?: string;
  page_text?: string;
  page_raw_text?: string;
  page_section_title?: string;
  page_section_kind?: string;
  page_extraction_method?: string;
  page_used_ocr?: boolean;
  page_has_image?: boolean;
  active_page?: Record<string, unknown>;

  // Segments
  sample_segment_count?: number;
  sample_segments?: RagViewerSegmentEntry[];

  // In-document search
  search_query?: string;
  search_matched_pages?: number[];
  search_match_count?: number;
  search_top_snippet?: string;
  search_results?: RagViewerSearchHitEntry[];

  // Access
  document_data_stores?: RagViewerDataStoreEntry[];
  document_provenance_label?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
