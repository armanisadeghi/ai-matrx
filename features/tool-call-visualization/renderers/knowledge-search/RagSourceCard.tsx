"use client";

import { useFileNode } from "@/features/files/hooks/useFileNode";
import { useOpenCitation } from "@/features/rag/components/source-inspector/useOpenCitation";
import { RagHitCard } from "@/features/rag/components/hit-card/RagHitCard";
import { normalizeSourceName } from "@/features/rag/components/hit-card/adapters";
import type { RagHitView } from "@/features/rag/components/hit-card/types";
import { hrefForNormalized, type NormalizedHit } from "./parseRag";

/**
 * One `knowledge_search` hit as a SOURCE card. A thin adapter that maps the tool's
 * `NormalizedHit` onto the canonical `RagHitView` and renders the ONE
 * `RagHitCard` (compact variant) shared with /rag/search + the omnibox — so the
 * chat card never drifts from the rest. Name resolution (Redux file map) and
 * the citation-window open live here; everything visual lives in RagHitCard.
 */

function viewFromNormalized(
  hit: NormalizedHit,
  name: string | null,
  libraryProvenance: string | null,
): RagHitView {
  return {
    sourceKind: hit.source_kind,
    sourceId: hit.source_id,
    chunkId: hit.chunk_id,
    fieldId: null,
    parentChunkId: null,
    chunkKind: null,
    title: name ?? hit.file_name ?? null,
    pageNumber: hit.page_number,
    pageNumbers: hit.page_number != null ? [hit.page_number] : null,
    score: hit.score,
    snippet: hit.snippet,
    vectorRank: hit.vector_rank,
    lexicalRank: hit.lexical_rank,
    rerankScore: hit.rerank_score,
    entityRank: hit.entity_rank,
    entities: hit.entities,
    metadata: hit.metadata,
    libraryShortCode: null,
    libraryProvenance,
  };
}

export function RagSourceCard({
  hit,
  topScore,
  query,
  sourceName,
  libraryProvenance = null,
}: {
  hit: NormalizedHit;
  /** Top score in the result set, for the relative relevance bar. */
  topScore: number;
  /** The originating search query — threaded into the source inspector. */
  query?: string | null;
  sourceName?: string | null;
  /** Shared-library grant provenance label, batch-resolved by the list
   *  surface (`useFilesLibraryProvenance`) — never fetched per card. */
  libraryProvenance?: string | null;
}) {
  const href = hrefForNormalized(hit);
  const isFile = hit.source_kind === "cld_file";

  // Resolve a friendly name from the eagerly-loaded cloud-files record (so
  // "File · e9868104" becomes the real filename). No-op read for non-file ids.
  const { file } = useFileNode(hit.source_id);
  const resolvedName =
    normalizeSourceName(sourceName, hit.source_id) ??
    normalizeSourceName(hit.file_name, hit.source_id) ??
    (isFile ? normalizeSourceName(file?.fileName, hit.source_id) : null);

  const openCitation = useOpenCitation();
  const open = () =>
    openCitation({
      sourceKind: hit.source_kind,
      sourceId: hit.source_id,
      chunkId: hit.chunk_id,
      pageNumber: hit.page_number,
      pageNumbers: hit.page_number != null ? [hit.page_number] : null,
      snippet: hit.snippet,
      fileName: resolvedName ?? hit.file_name ?? null,
      score: hit.score,
      query: query ?? null,
      href,
    });

  return (
    <RagHitCard
      view={viewFromNormalized(hit, resolvedName, libraryProvenance)}
      variant="compact"
      topScore={topScore}
      href={href}
      onOpen={open}
    />
  );
}

export function canonicalNormalizedSourceName(
  hit: NormalizedHit,
  siblings: readonly NormalizedHit[],
): string | null {
  for (const sibling of siblings) {
    if (
      sibling.source_kind === hit.source_kind &&
      sibling.source_id === hit.source_id
    ) {
      const name = normalizeSourceName(sibling.file_name, hit.source_id);
      if (name) return name;
    }
  }
  return null;
}
