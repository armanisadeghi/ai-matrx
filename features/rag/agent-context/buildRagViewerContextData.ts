/**
 * Canonical scope builder for the `matrx-user/rag-viewer` surface.
 *
 * Pure mapping of the live `/rag/viewer/[id]` state onto
 * `createRagViewerScope(...)`. Nothing here fetches — `LibraryPreviewPage`
 * already holds the document detail, the in-document search state, and the
 * shared-library provenance label, and its page-text pane lifts the loaded
 * page up through `onActivePageLoaded` so the route can emit it.
 *
 * `page_text` is whichever view the user is reading (`page_text_view`), so an
 * agent's default `content` is exactly the passage on screen — not a different
 * extraction of it.
 */

import {
  createRagViewerScope,
  type RagViewerDataStoreEntry,
  type RagViewerSearchHitEntry,
  type RagViewerSegmentEntry,
} from "@/features/surfaces/manifests/rag-viewer.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { LibraryDocDetail } from "@/features/rag/types/library";
import type {
  DocSearchHit,
  DocSearchSummary,
} from "@/features/rag/hooks/useDocumentSearch";
import type { components } from "@/types/python-generated/api-types";

type FullPage = components["schemas"]["LibraryFullPage"];

/** Cap the emitted in-document hit list. */
const MAX_SEARCH_HITS = 50;
/** Cap any single emitted text body. */
const MAX_TEXT_CHARS = 20000;

/** The page snapshot the middle pane lifts to the route. */
export interface RagViewerActivePage {
  page: FullPage;
  /** Which extraction the user is reading. */
  view: "cleaned" | "raw";
}

function toSegmentEntry(
  c: LibraryDocDetail["sampleChunks"][number],
): RagViewerSegmentEntry {
  return {
    id: c.id,
    chunk_index: c.chunkIndex,
    chunk_kind: c.chunkKind,
    token_count: c.tokenCount,
    page_numbers: c.pageNumbers,
    has_voyage_embedding: c.hasVoyageEmbedding,
    content_preview: c.contentPreview,
  };
}

function toDataStoreEntry(
  b: LibraryDocDetail["dataStores"][number],
): RagViewerDataStoreEntry {
  return {
    data_store_id: b.dataStoreId,
    name: b.name,
    kind: b.kind,
    short_code: b.shortCode,
  };
}

function toSearchHitEntry(h: DocSearchHit): RagViewerSearchHitEntry {
  const record = h as unknown as Record<string, unknown>;
  const rank = record["rank"];
  const snippet = record["snippet"] ?? record["content"] ?? record["text"];
  const chunkId = record["chunk_id"];
  return {
    chunk_id: typeof chunkId === "string" ? chunkId : null,
    page_numbers: Array.isArray(h.page_numbers) ? h.page_numbers : null,
    rank: typeof rank === "number" ? rank : null,
    snippet: typeof snippet === "string" ? snippet : "",
  };
}

export interface BuildRagViewerContextDataArgs {
  /** Processed-document id from the route. */
  documentId: string;
  /** The loaded document detail. Null while loading or on failure. */
  doc?: LibraryDocDetail | null;
  /** True while the document fetch is in flight. */
  docLoading?: boolean;
  /** Error message from the document fetch, when it failed. */
  docError?: string | null;
  /** 1-based number of the page the user is reading. */
  activePageNumber: number;
  /** The loaded page + which extraction is displayed. Null until it settles. */
  activePage?: RagViewerActivePage | null;
  /** The query currently highlighted, from `useDocumentSearch.activeQuery`. */
  searchQuery?: string;
  /** Ranked lexical hits for that query. Null when no search has run. */
  searchHits?: readonly DocSearchHit[] | null;
  /** Derived search summary (matched pages, counts, top hit). */
  searchSummary?: DocSearchSummary | null;
  /** Shared-library grant provenance label for this document's source. */
  provenanceLabel?: string | null;
  /** Browser text selection scoped to this surface, when the user made one. */
  selectionText?: string;
}

/**
 * Build the `matrx-user/rag-viewer` application scope from live viewer state.
 */
export function buildRagViewerContextData(
  args: BuildRagViewerContextDataArgs,
): SurfaceScopePayload {
  const {
    documentId,
    doc = null,
    docLoading = false,
    docError = null,
    activePageNumber,
    activePage = null,
    searchQuery = "",
    searchHits = null,
    searchSummary = null,
    provenanceLabel = null,
    selectionText = "",
  } = args;

  const loadStatus = docError ? "error" : doc ? "loaded" : docLoading ? "loading" : "loading";

  const page = activePage?.page ?? null;
  const shownText = page
    ? activePage?.view === "raw"
      ? (page.raw_text ?? "")
      : (page.cleaned_text ?? "")
    : "";
  const trimmedQuery = searchQuery.trim();

  const surround: Record<string, unknown> = {
    surface: "rag-viewer",
    document_id: documentId,
    document_name: doc?.name,
    status: doc?.status,
    page_number: activePageNumber,
    total_pages: doc?.totalPages ?? undefined,
    pages_persisted: doc?.pagesPersisted,
    segments: doc?.chunks,
    page_view: activePage?.view,
    used_ocr: page?.used_ocr,
    search_query: trimmedQuery || undefined,
    search_matches: searchSummary?.segmentCount,
  };

  return createRagViewerScope({
    // `content` is the passage on screen — the page the user is reading.
    selection: selectionText.length > 0 ? selectionText : undefined,
    content: shownText ? shownText.slice(0, MAX_TEXT_CHARS) : undefined,
    context: surround,

    document_id: documentId,
    document_load_status: loadStatus,
    active_page_number: activePageNumber,

    // ── Open document ─────────────────────────────────────────────────
    document_name: doc?.name,
    source_kind: doc?.sourceKind,
    source_id: doc?.sourceId,
    document_mime_type: doc?.mimeType ?? undefined,
    derivation_kind: doc?.derivationKind,
    parent_document_id: doc?.parentProcessedId ?? undefined,
    document_created_at: doc?.createdAt,
    document_updated_at: doc?.updatedAt,
    document_summary: doc
      ? {
          id: doc.id,
          name: doc.name,
          status: doc.status,
          source_kind: doc.sourceKind,
          source_id: doc.sourceId,
          mime_type: doc.mimeType,
          derivation_kind: doc.derivationKind,
          parent_processed_id: doc.parentProcessedId,
          total_pages: doc.totalPages,
          pages_persisted: doc.pagesPersisted,
          segments: doc.chunks,
          embeddings_voyage: doc.embeddingsVoyage,
          created_at: doc.createdAt,
          updated_at: doc.updatedAt,
        }
      : undefined,

    // ── Processing state ──────────────────────────────────────────────
    document_status: doc?.status,
    total_pages: doc?.totalPages ?? undefined,
    pages_persisted: doc?.pagesPersisted,
    segment_count: doc?.chunks,
    embeddings_voyage: doc?.embeddingsVoyage,
    embeddings_oai: doc?.embeddingsOai,
    has_structured_json: doc?.hasStructuredJson,

    // ── Active page ───────────────────────────────────────────────────
    page_text_view: activePage?.view,
    page_text: shownText ? shownText.slice(0, MAX_TEXT_CHARS) : undefined,
    page_raw_text: page?.raw_text ? page.raw_text.slice(0, MAX_TEXT_CHARS) : undefined,
    page_section_title: page?.section_title ?? undefined,
    page_section_kind: page?.section_kind ?? undefined,
    page_extraction_method: page?.extraction_method ?? undefined,
    page_used_ocr: page?.used_ocr,
    page_has_image: page?.has_image,
    active_page: page
      ? {
          page_number: page.page_number,
          page_index: page.page_index,
          view: activePage?.view,
          raw_char_count: page.raw_char_count,
          cleaned_char_count: page.cleaned_char_count,
          extraction_method: page.extraction_method,
          used_ocr: page.used_ocr,
          section_kind: page.section_kind,
          section_title: page.section_title,
          is_continuation: page.is_continuation,
          has_image: page.has_image,
        }
      : undefined,

    // ── Segments ──────────────────────────────────────────────────────
    sample_segment_count: doc ? doc.sampleChunks.length : undefined,
    sample_segments: doc ? doc.sampleChunks.map(toSegmentEntry) : undefined,

    // ── In-document search ────────────────────────────────────────────
    search_query: trimmedQuery || undefined,
    search_matched_pages: searchSummary?.matchedPages,
    search_match_count: searchSummary?.segmentCount,
    search_top_snippet: searchSummary?.topHit
      ? toSearchHitEntry(searchSummary.topHit).snippet || undefined
      : undefined,
    search_results: searchHits
      ? searchHits.slice(0, MAX_SEARCH_HITS).map(toSearchHitEntry)
      : undefined,

    // ── Access ────────────────────────────────────────────────────────
    document_data_stores: doc ? doc.dataStores.map(toDataStoreEntry) : undefined,
    document_provenance_label: provenanceLabel ?? undefined,
  });
}
