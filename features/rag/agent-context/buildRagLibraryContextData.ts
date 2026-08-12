/**
 * Canonical scope builder for the `matrx-user/rag-library` surface.
 *
 * Pure mapping of the live `/rag/library` and `/rag/library-catalog` state
 * onto `createRagLibraryScope(...)`, so the route emitter and any future
 * caller share one shape. Nothing here fetches — the pages already hold every
 * value; this only derives, caps, and names them the way the manifest declares.
 *
 * `library_view` discriminates the two routes; a builder call passes the
 * branch it is on and leaves the other branch's keys undefined.
 */

import {
  createRagLibraryScope,
  type RagLibraryCatalogEntry,
  type RagLibraryDocumentEntry,
  type RagLibraryJobEntry,
} from "@/features/surfaces/manifests/rag-library.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { DocStatus, LibraryDocSummary, LibrarySummary } from "@/features/rag/types/library";
import type { ProcessingJob } from "@/features/rag/hooks/useProcessingRunner";
import type { LibraryCatalogItem } from "@/features/rag/hooks/useLibraryCatalog";

/** Cap the emitted document list so one huge corpus can't blow the payload. */
const MAX_DOCUMENTS = 200;
/** Cap the emitted catalog list for the same reason. */
const MAX_CATALOG_ROWS = 200;
/** Cap the human-readable `content` blob. */
const CONTENT_CHARS = 8000;

function toDocumentEntry(d: LibraryDocSummary): RagLibraryDocumentEntry {
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    source_kind: d.sourceKind,
    source_id: d.sourceId,
    mime_type: d.mimeType,
    total_pages: d.totalPages,
    pages_persisted: d.pagesPersisted,
    segments: d.chunks,
    embeddings_voyage: d.embeddingsVoyage,
    data_store_count: d.dataStoreCount,
    derivation_kind: d.derivationKind,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

function toJobEntry(j: ProcessingJob): RagLibraryJobEntry {
  return {
    job_id: j.jobId,
    title: j.title,
    kind: j.kind,
    status: j.status,
    stage: j.frame?.activeStage ?? null,
    message: j.frame?.message ?? null,
    current: j.frame?.current ?? null,
    total: j.frame?.total ?? null,
    fraction: j.frame?.fraction ?? null,
  };
}

function toCatalogEntry(c: LibraryCatalogItem): RagLibraryCatalogEntry {
  return {
    id: c.id,
    name: c.name,
    short_code: c.shortCode,
    description: c.description,
    kind: c.kind,
    member_count: c.memberCount,
    subscribed: c.subscribed,
    entitled_via: c.entitledVia,
    entitled_industry_name: c.entitledIndustryName,
  };
}

function countBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Readable one-line-per-row rendering of the document table. */
function documentsText(docs: readonly LibraryDocSummary[]): string {
  return docs
    .map(
      (d) =>
        `${d.name} · ${d.status} · ${d.pagesPersisted} pages · ${d.chunks} segments · ${d.sourceKind}`,
    )
    .join("\n")
    .slice(0, CONTENT_CHARS);
}

/** Readable one-line-per-row rendering of the catalog list. */
function catalogText(items: readonly LibraryCatalogItem[]): string {
  return items
    .map((it) => {
      const entitlement = it.subscribed
        ? "subscribed"
        : it.entitledVia === "industry"
          ? `via ${it.entitledIndustryName ?? "industry"}`
          : it.entitledVia === "global"
            ? "available to everyone"
            : it.entitledVia === "organization"
              ? "granted to your organization"
              : "not entitled";
      return `${it.name} · ${it.memberCount} members · ${entitlement}${it.description ? ` — ${it.description}` : ""}`;
    })
    .join("\n")
    .slice(0, CONTENT_CHARS);
}

export interface BuildRagLibraryContextDataArgs {
  /** Which route is mounted. */
  view: "library" | "catalog";

  // ── /rag/library ────────────────────────────────────────────────────
  /** Corpus rollup from `useLibrarySummary`. Null while loading. */
  summary?: LibrarySummary | null;
  /** The document rows currently on screen. */
  documents?: readonly LibraryDocSummary[];
  /** Server-reported total matching the current query, before the page cap. */
  totalMatches?: number;
  /** Debounced text in the library search box. */
  searchQuery?: string;
  /** Active status filter, or "all" when unfiltered. */
  statusFilter?: DocStatus | "all";
  /** True while the document list fetch is in flight. */
  listLoading?: boolean;
  /** Error message from the document list fetch, when it failed. */
  listError?: string | null;
  /** Processed-document id whose detail sheet is open. */
  selectedDocumentId?: string | null;
  /** Jobs this session started (running and terminal). */
  jobs?: readonly ProcessingJob[];

  // ── /rag/library-catalog ────────────────────────────────────────────
  /** Every discoverable library returned to this caller. */
  catalogItems?: readonly LibraryCatalogItem[];
  /** The subset left after the catalog search box + entitled-only checkbox. */
  catalogVisible?: readonly LibraryCatalogItem[];
  /** Text in the catalog search box. */
  catalogQuery?: string;
  /** State of the "Only libraries I can read" checkbox. */
  catalogEntitledOnly?: boolean;
  /** Library id open in the detail pane (`?store_id`). */
  catalogSelectedId?: string | null;

  /** Browser text selection scoped to this surface, when the user made one. */
  selectionText?: string;
}

/**
 * Build the `matrx-user/rag-library` application scope from live page state.
 */
export function buildRagLibraryContextData(
  args: BuildRagLibraryContextDataArgs,
): SurfaceScopePayload {
  const {
    view,
    summary = null,
    documents = [],
    totalMatches,
    searchQuery = "",
    statusFilter = "all",
    listLoading = false,
    listError = null,
    selectedDocumentId = null,
    jobs = [],
    catalogItems = [],
    catalogVisible,
    catalogQuery = "",
    catalogEntitledOnly = false,
    catalogSelectedId = null,
    selectionText = "",
  } = args;

  const isLibrary = view === "library";
  const shownCatalog = catalogVisible ?? catalogItems;
  const activeJobs = jobs.filter((j) => j.status === "running");
  const selectedDoc = selectedDocumentId
    ? (documents.find((d) => d.id === selectedDocumentId) ?? null)
    : null;
  const selectedCatalog = catalogSelectedId
    ? (catalogItems.find((c) => c.id === catalogSelectedId) ?? null)
    : null;

  const listStatus = listError
    ? "error"
    : listLoading
      ? "loading"
      : documents.length === 0
        ? "empty"
        : "loaded";

  // `content` is what the user is actually reading: the rows on screen.
  const content = isLibrary
    ? documents.length > 0
      ? documentsText(documents)
      : undefined
    : shownCatalog.length > 0
      ? catalogText(shownCatalog)
      : undefined;

  // Small blob describing the surface's current framing. Cheap, no row dump.
  const surround: Record<string, unknown> = isLibrary
    ? {
        surface: "rag-library",
        view,
        search_query: searchQuery.trim() || undefined,
        status_filter: statusFilter === "all" ? undefined : statusFilter,
        listed: documents.length,
        total_matches: totalMatches,
        documents_total: summary?.documentsTotal,
        documents_pending: summary?.documentsPending,
        segments: summary?.chunks,
        active_jobs: activeJobs.length || undefined,
      }
    : {
        surface: "rag-library",
        view,
        search_query: catalogQuery.trim() || undefined,
        entitled_only: catalogEntitledOnly || undefined,
        libraries: catalogItems.length,
        listed: shownCatalog.length,
        entitled: catalogItems.filter((c) => c.entitledVia != null).length,
      };

  return createRagLibraryScope({
    selection: selectionText.length > 0 ? selectionText : undefined,
    content,
    context: surround,

    library_view: view,

    // ── Corpus totals ─────────────────────────────────────────────────
    documents_total: isLibrary ? summary?.documentsTotal : undefined,
    documents_ready: isLibrary ? summary?.documentsReady : undefined,
    documents_embedding: isLibrary ? summary?.documentsEmbedding : undefined,
    documents_extracted: isLibrary ? summary?.documentsExtracted : undefined,
    documents_pending: isLibrary ? summary?.documentsPending : undefined,
    pages_persisted: isLibrary ? summary?.pagesPersisted : undefined,
    segment_count: isLibrary ? summary?.chunks : undefined,
    embeddings_oai: isLibrary ? summary?.embeddingsOai : undefined,
    embeddings_voyage: isLibrary ? summary?.embeddingsVoyage : undefined,
    data_store_count: isLibrary ? summary?.dataStores : undefined,
    library_totals:
      isLibrary && summary
        ? {
            documents_total: summary.documentsTotal,
            documents_ready: summary.documentsReady,
            documents_embedding: summary.documentsEmbedding,
            documents_extracted: summary.documentsExtracted,
            documents_pending: summary.documentsPending,
            pages_persisted: summary.pagesPersisted,
            segments: summary.chunks,
            embeddings_oai: summary.embeddingsOai,
            embeddings_voyage: summary.embeddingsVoyage,
            data_stores: summary.dataStores,
          }
        : undefined,

    // ── List query ────────────────────────────────────────────────────
    library_search_query: isLibrary ? searchQuery.trim() || undefined : undefined,
    library_status_filter:
      isLibrary && statusFilter !== "all" ? statusFilter : undefined,
    // Read twin of the `library_filters` write target. Always emitted in the
    // library view, including when nothing is filtered — an agent about to
    // narrow the table needs to see the CURRENT framing, and an absent value
    // reads as "unknown" rather than "unfiltered".
    library_filters: isLibrary
      ? { search_query: searchQuery.trim(), status_filter: statusFilter }
      : undefined,
    library_total_matches: isLibrary ? totalMatches : undefined,
    library_visible_count: isLibrary ? documents.length : undefined,
    library_list_status: isLibrary ? listStatus : undefined,

    // ── Documents on screen ───────────────────────────────────────────
    visible_documents: isLibrary
      ? documents.slice(0, MAX_DOCUMENTS).map(toDocumentEntry)
      : undefined,
    selected_document_id: isLibrary ? (selectedDocumentId ?? undefined) : undefined,
    selected_document_name: isLibrary ? (selectedDoc?.name ?? undefined) : undefined,
    document_status_breakdown:
      isLibrary && documents.length > 0
        ? countBy(documents, (d) => d.status)
        : undefined,
    document_source_kinds:
      isLibrary && documents.length > 0
        ? countBy(documents, (d) => d.sourceKind)
        : undefined,

    // ── Active processing ─────────────────────────────────────────────
    active_job_count: isLibrary ? activeJobs.length : undefined,
    active_jobs: isLibrary && jobs.length > 0 ? jobs.map(toJobEntry) : undefined,

    // ── Shared library catalog ────────────────────────────────────────
    catalog_library_count: isLibrary ? undefined : catalogItems.length,
    catalog_visible_count: isLibrary ? undefined : shownCatalog.length,
    catalog_search_query: isLibrary ? undefined : catalogQuery.trim() || undefined,
    catalog_entitled_only: isLibrary ? undefined : catalogEntitledOnly || undefined,
    // Read twin of the `catalog_filters` write target — same reasoning as
    // `library_filters` above.
    catalog_filters: isLibrary
      ? undefined
      : { search_query: catalogQuery.trim(), entitled_only: catalogEntitledOnly },
    catalog_entitled_count: isLibrary
      ? undefined
      : catalogItems.filter((c) => c.entitledVia != null).length,
    catalog_selected_library_id: isLibrary ? undefined : (catalogSelectedId ?? undefined),
    catalog_selected_library:
      !isLibrary && selectedCatalog ? toCatalogEntry(selectedCatalog) : undefined,
    catalog_libraries:
      !isLibrary && shownCatalog.length > 0
        ? shownCatalog.slice(0, MAX_CATALOG_ROWS).map(toCatalogEntry)
        : undefined,
  });
}
