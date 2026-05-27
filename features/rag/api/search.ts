/**
 * features/rag/api/search.ts
 *
 * Typed client for `POST /rag/search`. Mirror of the Python team's
 * `SearchHitOut` / `SearchResponseOut` shapes.
 *
 * Lives in the rag feature alongside the other RAG endpoints (ingest,
 * stages, document) and is consumed by both the dedicated RAG search
 * page and embedded surfaces (file context menu, omnibox, embed-in-chat).
 */
import { postJson } from "@/lib/python-client";

export interface RagSearchHit {
  chunk_id: string;
  source_kind: "cld_file" | "note" | "code_file" | string;
  source_id: string;
  field_id: string | null;
  parent_chunk_id: string | null;
  chunk_kind: string;
  /** First N characters of the chunk body — already truncated server-side. */
  snippet: string;
  score: number;
  vector_rank: number | null;
  lexical_rank: number | null;
  rerank_score: number | null;
  metadata: Record<string, unknown>;
}

export interface RagSearchResponse {
  query: string;
  hits: RagSearchHit[];
  total_candidates: number;
  embedding_model: string;
  reranker_model: string | null;
  latency_ms: number;
}

export interface RagSearchFilters {
  organization_id?: string | null;
  source_kinds?: ("cld_file" | "note" | "code_file")[];
}

export interface RagSearchRequest {
  query: string;
  limit?: number;
  rerank?: boolean;
  only_children?: boolean;
  embedding_models?: string[];
  multi_query?: boolean;
  use_hyde?: boolean;
  use_mmr?: boolean;
  filters?: RagSearchFilters;
  /**
   * Scope the search to one curated data store. When set, only chunks
   * from that store's members are returned.
   */
  data_store_id?: string | null;
  /** Hard-pin to specific (source_kind, source_id) pairs. */
  include_sources?: { source_kind: string; source_id: string }[];
  /**
   * Admin-only: bypass per-user ACL and search every chunk in every
   * tenant. The backend ignores this flag for non-admins. Used by the
   * Search Lab UI to answer "do these chunks exist at all?".
   */
  admin_bypass_acl?: boolean;
}

/** Run a single RAG search. Throws on non-OK responses. */
export async function ragSearch(
  body: RagSearchRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<RagSearchResponse> {
  const { data } = await postJson<RagSearchResponse, RagSearchRequest>(
    `/rag/search`,
    body,
    { signal: opts.signal },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Citation routing
//
// A hit's `source_kind` decides where the user lands when clicking it:
//   - cld_file  → /files/f/<source_id>?tab=document&chunk=<chunk_id>[&page=]
//   - note      → /notes/<source_id> (noteid is the row id)
//   - code_file → /code/<source_id>  (legacy code workspace)
//
// The `metadata` dict on a hit may carry `page_number` for pdf-extracted
// chunks; the helper looks it up and adds &page= when present.
// ---------------------------------------------------------------------------

export function citationHrefFor(hit: RagSearchHit): string {
  const pageRaw = hit.metadata?.["page_number"];
  const page =
    typeof pageRaw === "number"
      ? pageRaw
      : typeof pageRaw === "string"
        ? Number.parseInt(pageRaw, 10)
        : null;
  const pageQs = page && Number.isFinite(page) ? `&page=${page}` : "";

  switch (hit.source_kind) {
    case "cld_file":
      return `/files/f/${encodeURIComponent(
        hit.source_id,
      )}?tab=document&chunk=${encodeURIComponent(hit.chunk_id)}${pageQs}`;
    case "note":
      return `/notes/${encodeURIComponent(hit.source_id)}`;
    case "code_file":
      return `/code/${encodeURIComponent(hit.source_id)}`;
    default:
      // Unknown source kinds fall through to the standalone document
      // viewer — works whenever the chunk's underlying processed_document
      // can be derived server-side from its source_id.
      return `/rag/viewer/${encodeURIComponent(
        hit.source_id,
      )}?chunk=${encodeURIComponent(hit.chunk_id)}${pageQs}`;
  }
}
