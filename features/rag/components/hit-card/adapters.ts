import type { RagSearchHit } from "@/features/rag/api/search";
import type { DiagnoseHit } from "@/features/rag/api/search-lab";
import type { RagHitView } from "./types";

/**
 * Adapt the search API's `RagSearchHit` and the diagnose lab's `DiagnoseHit`
 * (they share a shape; page/name live on `metadata` for the former, directly on
 * the latter) into the canonical `RagHitView`. The `knowledge_search` tool's
 * `NormalizedHit` is adapted at its own callsite where that type lives.
 */

function pageValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pagesFromMeta(meta: Record<string, unknown>): {
  primary: number | null;
  pages: number[] | null;
} {
  const page = pageValue(meta["page_number"]);
  if (page != null) return { primary: page, pages: [page] };

  const first = pageValue(meta["first_page"]);
  const last = pageValue(meta["last_page"]);
  if (first == null && last == null) return { primary: null, pages: null };

  const start = first ?? last;
  const end = last ?? first;
  if (start == null || end == null) return { primary: null, pages: null };
  if (end < start || end - start > 100) {
    return { primary: start, pages: start === end ? [start] : [start, end] };
  }
  return {
    primary: start,
    pages: Array.from({ length: end - start + 1 }, (_, index) => start + index),
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_FRAGMENT_RE = /^#?[0-9a-f]{8}(?:…[0-9a-f]{4})?$/i;

/**
 * A source name must be a human label, never an ID dressed up as one. Paths
 * are reduced to their basename so every hit from one file presents the same
 * compact identity.
 */
export function normalizeSourceName(
  value: unknown,
  sourceId?: string,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (
    UUID_RE.test(withoutHash) ||
    UUID_FRAGMENT_RE.test(trimmed) ||
    (sourceId &&
      (withoutHash.toLowerCase() === sourceId.toLowerCase() ||
        withoutHash.toLowerCase() === sourceId.slice(0, 8).toLowerCase()))
  ) {
    return null;
  }

  const pathParts = trimmed.split(/[\\/]/);
  return pathParts[pathParts.length - 1] || trimmed;
}

function sourceNameFromHit(hit: RagSearchHit | DiagnoseHit): string | null {
  const meta = (hit.metadata ?? {}) as Record<string, unknown>;
  const src = (meta["source"] ?? {}) as Record<string, unknown>;
  const directName = "file_name" in hit ? hit.file_name : null;
  const candidates = [
    directName,
    src["file_name"],
    meta["source_label"],
    src["title"],
    src["path"],
  ];

  for (const candidate of candidates) {
    const normalized = normalizeSourceName(candidate, hit.source_id);
    if (normalized) return normalized;
  }
  return null;
}

/**
 * Search results often repeat one source across many chunks, but only some
 * hits carry the filename. Resolve against sibling hits so that one real name
 * hydrates every card for the same `(source_kind, source_id)` pair.
 */
export function canonicalSourceNameForHit(
  hit: RagSearchHit | DiagnoseHit,
  siblings: readonly (RagSearchHit | DiagnoseHit)[],
): string | null {
  for (const sibling of siblings) {
    if (
      sibling.source_kind === hit.source_kind &&
      sibling.source_id === hit.source_id
    ) {
      const name = sourceNameFromHit(sibling);
      if (name) return name;
    }
  }
  return sourceNameFromHit(hit);
}

export function hitViewFromSearchHit(
  hit: RagSearchHit | DiagnoseHit,
  opts?: { name?: string | null; libraryProvenance?: string | null },
): RagHitView {
  const meta = (hit.metadata ?? {}) as Record<string, unknown>;
  const src = (meta["source"] ?? {}) as Record<string, unknown>;
  const name =
    normalizeSourceName(opts?.name, hit.source_id) ?? sourceNameFromHit(hit);
  const directPage =
    "page_number" in hit && hit.page_number != null ? hit.page_number : null;
  const directPages =
    "page_numbers" in hit && Array.isArray(hit.page_numbers)
      ? Array.from(
          new Set(
            hit.page_numbers
              .map(pageValue)
              .filter((value): value is number => value != null),
          ),
        )
      : [];
  const metadataPages = pagesFromMeta(meta);
  const page = directPage ?? directPages[0] ?? metadataPages.primary;
  // Entity-lane provenance exists ONLY on the search lane (`RagSearchHit`).
  // The diagnose contract's DiagnoseHit carries none (server model is
  // extra="forbid"), so the `in` check narrows the union: search hits keep
  // their provenance, diagnose hits explicitly pass none — the "entity match
  // only" flag can never light up for a diagnose hit.
  const entityRank = "entity_rank" in hit ? hit.entity_rank : null;
  const entities = "entities" in hit ? hit.entities : [];

  return {
    sourceKind: hit.source_kind,
    sourceId: hit.source_id,
    chunkId: hit.chunk_id,
    fieldId: "field_id" in hit ? hit.field_id : null,
    parentChunkId: "parent_chunk_id" in hit ? hit.parent_chunk_id : null,
    chunkKind: hit.chunk_kind ?? null,
    title: name,
    pageNumber: page,
    pageNumbers:
      directPages.length > 0
        ? directPages
        : directPage != null
          ? [directPage]
          : metadataPages.pages,
    score: typeof hit.score === "number" ? hit.score : 0,
    snippet: hit.snippet ?? "",
    vectorRank: hit.vector_rank ?? null,
    lexicalRank: hit.lexical_rank ?? null,
    rerankScore: hit.rerank_score ?? null,
    entityRank,
    entities,
    metadata: meta,
    libraryShortCode: (src["library_short_code"] as string | undefined) ?? null,
    libraryProvenance: opts?.libraryProvenance ?? null,
  };
}
