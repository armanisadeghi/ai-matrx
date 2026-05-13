/**
 * features/rag/api/document.ts
 *
 * Read-only client for the unified document API at /api/document/*.
 * Reuses the cld_files client's typed helpers (auth header + base URL +
 * error normalisation are identical).
 */

import { getJson } from "@/lib/python-client";
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
  const { data } = await getJson<DocumentDetail>(
    `/api/document/${encodeURIComponent(docId)}`,
  );
  return data;
}

export async function fetchDocumentLineage(
  docId: string,
): Promise<LineageTree> {
  const { data } = await getJson<LineageTree>(
    `/api/document/${encodeURIComponent(docId)}/lineage`,
  );
  return data;
}

export async function fetchDocumentPages(
  docId: string,
  range: { from?: number; to?: number } = {},
): Promise<PageSummary[]> {
  const params = new URLSearchParams();
  if (range.from !== undefined) params.set("from", String(range.from));
  if (range.to !== undefined) params.set("to", String(range.to));
  const qs = params.toString();
  const { data } = await getJson<PageSummary[]>(
    `/api/document/${encodeURIComponent(docId)}/pages${qs ? `?${qs}` : ""}`,
  );
  return data;
}

export async function fetchDocumentPage(
  docId: string,
  pageIndex: number,
  opts: { includeBlocks?: boolean; includeWords?: boolean } = {},
): Promise<PageDetail> {
  const params = new URLSearchParams();
  if (opts.includeBlocks) params.set("include_blocks", "true");
  if (opts.includeWords) params.set("include_words", "true");
  const qs = params.toString();
  const { data } = await getJson<PageDetail>(
    `/api/document/${encodeURIComponent(docId)}/page/${pageIndex}${qs ? `?${qs}` : ""}`,
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
  const params = new URLSearchParams();
  if (filters.parentOnly) params.set("parent_only", "true");
  if (filters.childrenOnly) params.set("children_only", "true");
  if (filters.sectionKind) params.set("section_kind", filters.sectionKind);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  const { data } = await getJson<ChunkRow[]>(
    `/api/document/${encodeURIComponent(docId)}/chunks${qs ? `?${qs}` : ""}`,
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
