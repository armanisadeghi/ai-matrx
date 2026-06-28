/**
 * Types for /rag/library — the visibility surface for processed documents.
 *
 * A "processed document" is a row in `docproc.processed_documents` representing
 * one extraction/processing run over a source (PDF, note, code file, …).
 * The library lists every doc the caller owns with derived counts and a
 * status badge, so partial / failed ingestions are visible at a glance.
 */

export type DocStatus =
  | "ready"       // chunks present, embeddings cover all chunks
  | "embedding"   // chunks present, embeddings still flowing in
  | "chunking"    // pages persisted, chunking in progress
  | "extracted"   // pages persisted, no chunks yet
  | "pending"     // row exists but no pages persisted yet (likely failed early)
  | "unknown";

export interface LibraryDocSummary {
  id: string;
  name: string;
  sourceKind: string;
  sourceId: string;
  mimeType: string | null;
  totalPages: number | null;
  pagesPersisted: number;
  chunks: number;
  embeddingsOai: number;
  embeddingsVoyage: number;
  dataStoreCount: number;
  hasStructuredJson: boolean;
  derivationKind: string;
  parentProcessedId: string | null;
  status: DocStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryListResponse {
  documents: LibraryDocSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface LibraryPagePreview {
  pageIndex: number;
  pageNumber: number;
  rawCharCount: number;
  cleanedCharCount: number;
  extractionMethod: string | null;
  usedOcr: boolean;
  sectionKind: string | null;
  sectionTitle: string | null;
  isContinuation: boolean;
  cleanedPreview: string;
  rawPreview: string;
  hasImage: boolean;
}

export interface LibraryChunkPreview {
  id: string;
  chunkIndex: number | null;
  chunkKind: string | null;
  tokenCount: number | null;
  pageNumbers: number[] | null;
  hasOaiEmbedding: boolean;
  hasVoyageEmbedding: boolean;
  contentPreview: string;
}

export interface LibraryDataStoreBinding {
  dataStoreId: string;
  name: string;
  kind: string;
  shortCode: string | null;
}

export interface LibraryDocDetail {
  id: string;
  name: string;
  sourceKind: string;
  sourceId: string;
  mimeType: string | null;
  totalPages: number | null;
  pagesPersisted: number;
  chunks: number;
  embeddingsOai: number;
  embeddingsVoyage: number;
  hasStructuredJson: boolean;
  storageUri: string | null;
  derivationKind: string;
  parentProcessedId: string | null;
  status: DocStatus;
  createdAt: string;
  updatedAt: string;
  pages: LibraryPagePreview[];
  sampleChunks: LibraryChunkPreview[];
  dataStores: LibraryDataStoreBinding[];
}

export interface LibrarySummary {
  documentsTotal: number;
  documentsReady: number;
  documentsEmbedding: number;
  documentsExtracted: number;
  documentsPending: number;
  pagesPersisted: number;
  chunks: number;
  embeddingsOai: number;
  embeddingsVoyage: number;
  dataStores: number;
}
