/**
 * Runtime scope builder for the `matrx-user/documents` surface.
 *
 * PURE: maps live route state → `createDocumentsScope(...)`. Two entry points
 * because the surface has two faces (see the manifest header):
 *   - `buildDocumentsLibraryContextData` — `/documents` (the list)
 *   - `buildDocumentContextData`         — `/documents/[id]` (one document)
 *
 * FILE DOCTRINE (features/files/handler/FEATURE.md): the only file reference
 * this surface emits is `document_original_file_id`, a durable `files.files`
 * UUID. No signed URLs, no S3 storage URIs — ever.
 */

import {
  createDocumentsScope,
  type DocumentSummaryValue,
} from "@/features/surfaces/manifests/documents.manifest";
import type { DocumentRow } from "@/features/data-tables/types";
import type { DocumentSortKey } from "@/features/data-tables/utils/documentsHubDisplay";

export const DOCUMENTS_SURFACE_NAME = "matrx-user/documents" as const;

/** Row lists are capped so a large library can't blow the context window. */
const ROW_CAP = 200;

function toRowSummary(doc: DocumentRow): DocumentSummaryValue {
  return {
    id: doc.id,
    name: doc.document_name,
    description: doc.description,
    source: doc.source,
    is_public: doc.is_public,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

function toFullSummary(doc: DocumentRow): DocumentSummaryValue {
  return {
    ...toRowSummary(doc),
    version: doc.version,
    owner_id: doc.user_id,
    organization_id: doc.organization_id,
    // Durable file id only — never a URL.
    original_file_id: doc.original_file_id,
  };
}

export interface BuildDocumentsLibraryArgs {
  /** Every accessible document loaded for the library. */
  documents: DocumentRow[];
  /** The filtered + sorted rows actually on screen. */
  visibleDocuments: DocumentRow[];
  searchQuery: string;
  sortKey: DocumentSortKey;
  viewMode: string;
  loading: boolean;
  error: string | null;
}

/** `/documents` — the library list. */
export function buildDocumentsLibraryContextData(
  args: BuildDocumentsLibraryArgs,
): Record<string, unknown> {
  const {
    documents,
    visibleDocuments,
    searchQuery,
    sortKey,
    viewMode,
    loading,
    error,
  } = args;

  const status = loading
    ? "loading"
    : error
      ? "error"
      : documents.length === 0
        ? "empty"
        : "loaded";

  const summary: Record<string, unknown> = {
    search_query: searchQuery || null,
    sort_key: sortKey,
    view_mode: viewMode,
    total: documents.length,
    visible: visibleDocuments.length,
    status,
  };

  const scope = createDocumentsScope({
    documents_view: "library",
    library_document_count: documents.length,
    library_visible_count: visibleDocuments.length,
    library_search_query: searchQuery || undefined,
    library_sort_key: sortKey,
    library_view_mode: viewMode,
    library_status: status,
    visible_documents: visibleDocuments.slice(0, ROW_CAP).map(toRowSummary),
    library_query_summary: summary,
    context: {
      surface: "documents-library",
      ...summary,
    },
  });

  return scope as Record<string, unknown>;
}

export interface BuildDocumentArgs {
  /** The open document row — null while it is still loading or failed. */
  document: DocumentRow | null;
  /** Resolved edit permission (owner, or an editor-level grant). */
  canEdit: boolean;
  /** True when the current user owns the document. */
  isOwner: boolean;
}

/** `/documents/[id]` — one open document. */
export function buildDocumentContextData(
  args: BuildDocumentArgs,
): Record<string, unknown> {
  const { document, canEdit, isOwner } = args;

  if (!document) {
    // The route is mounted but the row hasn't resolved — emit the one
    // guaranteed value rather than inventing a document.
    return createDocumentsScope({
      documents_view: "document",
      context: { surface: "documents-document", loaded: false },
    }) as Record<string, unknown>;
  }

  const summary = toFullSummary(document);

  const scope = createDocumentsScope({
    documents_view: "document",
    document_id: document.id,
    document_name: document.document_name,
    document_description: document.description ?? undefined,
    document_source: document.source,
    document_original_file_id: document.original_file_id ?? undefined,
    document_version: document.version,
    document_created_at: document.created_at,
    document_updated_at: document.updated_at,
    document_owner_id: document.user_id,
    document_organization_id: document.organization_id ?? undefined,
    document_summary: summary,
    document_is_public: document.is_public,
    document_can_edit: canEdit,
    document_is_owner: isOwner,
    context: {
      surface: "documents-document",
      loaded: true,
      document: summary,
      can_edit: canEdit,
      is_owner: isOwner,
    },
  });

  return scope as Record<string, unknown>;
}
