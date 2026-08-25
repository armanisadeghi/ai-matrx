"use client";

/**
 * `retrieved_chunk` — THE canonical component for one passage a retrieval
 * returned (RAG Kinds Run, Stage B).
 *
 * 🚨 IT DRAWS NO CARD OF ITS OWN. `features/rag/components/hit-card/RagHitCard`
 * is the declared canonical Knowledge hit card, and this repo has already
 * killed three rivals to it. The kind value is adapted to `RagHitView` — the
 * ONE normalized shape that card renders — exactly as every other Knowledge
 * surface does (`hit-card/adapters.ts::hitViewFromSearchHit` is the sibling
 * adapter for the REST hit shape; this is the same move for the kind shape).
 * A fourth hit card would be a defect, not a feature.
 *
 * WHAT THE KIND ADDS THAT THE REST HIT SHAPE COULD NOT: a nested `source_ref`.
 * The card knows a source's NAME; `source_ref` knows its short code, its URL,
 * its authority, its version and whether it is still in force. So the source
 * renders BELOW the card, through the one-way delegation seam, as the
 * `source_ref` kind's own component — never re-drawn here.
 *
 * A CHUNK IS NOT A CITATION, and the split is deliberate: a `retrieved_chunk`
 * is an artefact of ONE retrieval (matched text, lane ranks, rerank score,
 * entities), while a `source_ref` is a durable pointer that means the same
 * thing next month with no retrieval behind it. Merging them loses both.
 */

import React from "react";
import { cn } from "@/lib/utils";
import type { RagHitView } from "@/features/rag/components/hit-card/types";
import { RagHitCard } from "@/features/rag/components/hit-card/RagHitCard";
import { useOpenCitation } from "@/features/rag/components/source-inspector/useOpenCitation";
import type { PartialKindPayload } from "@/features/content-ir/kinds/kind-payload";
import {
  isRecord,
  num,
  readSearchKindValue,
  strings,
  text,
} from "../search-kinds/search-kind-data";
import { RagKindNested } from "./RagKindNested";
import {
  citationInputForSourceRef,
  locatorFirstPage,
  retrievalSourceKind,
  sourceRefHref,
  sourceRefLabel,
} from "./rag-kind-shared";

export interface RetrievedChunkBlockProps {
  serverData?: unknown;
  className?: string;
  /** Top score in the surrounding result set, for the relative relevance bar. */
  topScore?: number;
  /** 1-based rank within the result set. */
  rank?: number | null;
  /** The query, for word-chain highlighting inside the passage. */
  query?: string | null;
  /** "compact" for a chip-sized row, "expanded" for the full lab card. */
  variant?: "compact" | "expanded";
}

/**
 * The kind value → the ONE normalized hit view. Mirrors
 * `hit-card/adapters.ts::hitViewFromSearchHit`, which does the same job for the
 * REST hit shape — the view type is the shared target, so this is consuming the
 * canonical normalization, not forking a card.
 */
export function hitViewFromRetrievedChunk(
  value: PartialKindPayload<"retrieved_chunk">,
): RagHitView {
  const source = isRecord(value.source) ? value.source : {};
  const page = locatorFirstPage(source.locator);
  return {
    sourceKind: retrievalSourceKind(text(source.source_kind)),
    sourceId: text(source.source_id) ?? text(source.url) ?? "",
    chunkId: text(value.chunk_id) ?? "",
    // `field_id` was measured null on 24 of 24 captures and is NOT carried by
    // the kind — the view declares it, so it is explicitly null rather than
    // silently invented.
    fieldId: null,
    parentChunkId: text(value.parent_chunk_id),
    chunkKind: text(value.chunk_kind),
    title: sourceRefLabel(source),
    pageNumber: page,
    pageNumbers: page != null ? [page] : null,
    score: num(value.score) ?? 0,
    snippet: text(value.content_text) ?? "",
    vectorRank: num(value.vector_rank),
    lexicalRank: num(value.lexical_rank),
    rerankScore: num(value.rerank_score),
    entityRank: num(value.entity_rank),
    entities: strings(value.entities),
    // The card's copy-for-AI surfaces this verbatim, so it carries the
    // provenance the kind DOES have rather than an empty bag.
    metadata: {
      derivation_kind: text(value.derivation_kind),
      agent_id: text(value.agent_id),
      extraction_run_id: text(value.extraction_run_id),
      priority: num(value.priority),
    },
    libraryShortCode: text(source.short_code),
    libraryProvenance: null,
  };
}

export function RetrievedChunkBlock({
  serverData,
  className,
  topScore,
  rank,
  query,
  variant = "expanded",
}: RetrievedChunkBlockProps) {
  const { value } = readSearchKindValue<"retrieved_chunk">(serverData);
  const openCitation = useOpenCitation();

  const chunkId = text(value.chunk_id);
  const body = text(value.content_text);
  // Half-arrived is normal; an empty card is not.
  if (!chunkId && !body) return null;

  const source = isRecord(value.source) ? value.source : null;
  const view = hitViewFromRetrievedChunk(value);
  const href = source ? sourceRefHref(source, chunkId, view.pageNumber) : null;
  const citationInput = source
    ? citationInputForSourceRef(source, {
        chunkId,
        pageNumber: view.pageNumber,
        query,
      })
    : null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <RagHitCard
        view={view}
        variant={variant}
        topScore={topScore}
        rank={rank}
        href={href ?? "#"}
        onOpen={() => {
          if (citationInput) openCitation(citationInput);
        }}
        highlightQuery={query ?? undefined}
        defaultExpanded={variant === "expanded"}
      />
      {/* The durable pointer, through ITS canonical component — one-way. */}
      {source && (
        <div className="flex flex-wrap items-center gap-1.5 pl-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Source
          </span>
          <RagKindNested value={source} variant="inline" chunkId={chunkId} query={query} />
        </div>
      )}
    </div>
  );
}

export default RetrievedChunkBlock;
