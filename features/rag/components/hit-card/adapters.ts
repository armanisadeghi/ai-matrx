import type { RagSearchHit } from "@/features/rag/api/search";
import type { DiagnoseHit } from "@/features/rag/api/search-lab";
import type { RagHitView } from "./types";

/**
 * Adapt the search API's `RagSearchHit` and the diagnose lab's `DiagnoseHit`
 * (they share a shape; page/name live on `metadata` for the former, directly on
 * the latter) into the canonical `RagHitView`. The `rag_search` tool's
 * `NormalizedHit` is adapted at its own callsite where that type lives.
 */

function pageFromMeta(meta: Record<string, unknown>): number | null {
  const pn = meta["page_number"];
  if (typeof pn === "number") return pn;
  if (typeof pn === "string") {
    const n = Number.parseInt(pn, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function hitViewFromSearchHit(
  hit: RagSearchHit | DiagnoseHit,
  opts?: { name?: string | null },
): RagHitView {
  const meta = (hit.metadata ?? {}) as Record<string, unknown>;
  const src = (meta["source"] ?? {}) as Record<string, unknown>;
  const directName = "file_name" in hit ? hit.file_name : null;
  const name =
    opts?.name ??
    directName ??
    (src["file_name"] as string | undefined) ??
    (src["title"] as string | undefined) ??
    (src["path"] as string | undefined) ??
    null;
  const directPage =
    "page_number" in hit && hit.page_number != null ? hit.page_number : null;
  const page = directPage ?? pageFromMeta(meta);
  const entityRank =
    "entity_rank" in hit && hit.entity_rank != null ? hit.entity_rank : null;
  const entities =
    "entities" in hit && Array.isArray(hit.entities) ? hit.entities : [];

  return {
    sourceKind: hit.source_kind,
    sourceId: hit.source_id,
    chunkId: hit.chunk_id,
    title: name,
    pageNumber: page,
    pageNumbers: page != null ? [page] : null,
    score: typeof hit.score === "number" ? hit.score : 0,
    snippet: hit.snippet ?? "",
    vectorRank: hit.vector_rank ?? null,
    lexicalRank: hit.lexical_rank ?? null,
    rerankScore: hit.rerank_score ?? null,
    entityRank,
    entities,
    libraryShortCode: (src["library_short_code"] as string | undefined) ?? null,
  };
}
