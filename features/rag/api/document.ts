/**
 * features/rag/api/document.ts
 *
 * Read-only client for the unified document API at /api/document/*.
 * All calls go through the contract-bound typed client
 * (`@/lib/api/typed-client`) — path, params, and response shapes are
 * derived from the generated OpenAPI contract, never asserted.
 */

import { apiGet, buildPath } from "@/lib/api/typed-client";
import type {
  ChunkRow,
  DocumentDetail,
  LineageTree,
  PageDetail,
  PageSummary,
} from "@/features/rag/types/documents";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchDocument(docId: string): Promise<DocumentDetail> {
  const { data } = await apiGet(
    buildPath("/api/document/{doc_id}", { doc_id: docId }),
  );
  return data;
}

export async function fetchDocumentLineage(
  docId: string,
): Promise<LineageTree> {
  const { data } = await apiGet(
    buildPath("/api/document/{doc_id}/lineage", { doc_id: docId }),
  );
  return data;
}

export async function fetchDocumentPages(
  docId: string,
  range: { from?: number; to?: number } = {},
): Promise<PageSummary[]> {
  const { data } = await apiGet(
    buildPath("/api/document/{doc_id}/pages", { doc_id: docId }),
    { query: { from: range.from, to: range.to } },
  );
  return data;
}

export async function fetchDocumentPage(
  docId: string,
  pageIndex: number,
  opts: { includeBlocks?: boolean; includeWords?: boolean } = {},
): Promise<PageDetail> {
  const { data } = await apiGet(
    buildPath("/api/document/{doc_id}/page/{page_index}", {
      doc_id: docId,
      page_index: pageIndex,
    }),
    {
      query: {
        // Only send the flag when it's ON — matches the server default (off).
        include_blocks: opts.includeBlocks || undefined,
        include_words: opts.includeWords || undefined,
      },
    },
  );
  return data;
}

export async function fetchDocumentChunks(
  docId: string,
  filters: {
    parentOnly?: boolean;
    childrenOnly?: boolean;
    sectionKind?: string;
    limit?: number;
  } = {},
): Promise<ChunkRow[]> {
  const { data } = await apiGet(
    buildPath("/api/document/{doc_id}/chunks", { doc_id: docId }),
    {
      query: {
        parent_only: filters.parentOnly || undefined,
        children_only: filters.childrenOnly || undefined,
        section_kind: filters.sectionKind,
        limit: filters.limit || undefined,
      },
    },
  );
  return data;
}

/** Page-image is served as a 307 redirect to a signed cld_files URL. */
export function pageImageUrl(
  docId: string,
  pageIndex: number,
  dpi = 150,
): string {
  return `/api/document/${encodeURIComponent(docId)}/page/${pageIndex}/image?dpi=${dpi}`;
}
