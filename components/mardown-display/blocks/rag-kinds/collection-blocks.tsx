"use client";

/**
 * The RAG collection kinds — `rag_search_result`, `rag_cross_doc_search_result`
 * and `rag_synthesize_result` (RAG Kinds Run, Stage B).
 *
 * Each is THE one renderer for its kind. Every nested instance goes through the
 * one-way delegation seam (`RagKindNested`) so a passage renders through the
 * `retrieved_chunk` component and its source through the `source_ref`
 * component — this file re-draws neither.
 *
 * 🚨 PRE-CUTOVER TYPING for the two search collections. Their registry rows
 * still carry the pre-supersede schema (v4: `hits` as an anonymous object, no
 * `diagnostics`), because `hits` becoming the `retrieved_chunk` kind declares a
 * `__kind` const the live schema has none of — a narrowing, so it rides Stage D
 * with the node repoint. The publisher REFUSED both on 2026-08-24, correctly.
 * The registry-generated types therefore cover the legacy fields only, and the
 * new half is read defensively off the same object with ONE documented cast.
 * At cutover the rows become the models' full shape, `pnpm shape:types`
 * regenerates, and the `raw` reads collapse into typed ones. Do NOT hand-write
 * an interface for the new shape meanwhile — that is the twin
 * `check:kind-type-twins` exists to refuse. Same posture as
 * `SeoRankSerpLandscapeBlock`.
 *
 * 🚨 DIAGNOSTICS ARE NOT DECORATION. Stage A measured that `rerank_status` and
 * the per-lane candidate counts exist in the live retrieval envelope and reach
 * NO consumer at all. "Why didn't it find my document?" is usually answered by
 * `lexical_candidates: 0`, and until now nobody could see it. The panel renders
 * on every search collection, always.
 */

import React from "react";
import { BookOpenText, Layers, MessageSquareQuote, Search, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import {
  isRecord,
  num,
  readSearchKindValue,
  records,
  strings,
  text,
} from "../search-kinds/search-kind-data";
import { SectionHeading } from "../search-kinds/search-kind-shared";
import { RagKindNested } from "./RagKindNested";
import { RagChip, RetrievalDiagnosticsPanel } from "./rag-kind-shared";

interface RagBlockProps {
  serverData?: unknown;
  className?: string;
}

/** The best score in a hit list — the denominator for the relevance bars. */
function topScoreOf(hits: Record<string, unknown>[]): number | undefined {
  let top: number | undefined;
  for (const hit of hits) {
    const score = num(hit.score);
    if (score !== null && (top === undefined || score > top)) top = score;
  }
  return top;
}

/** One section of retrieved passages, delegated one-by-one. */
const HitList: React.FC<{
  hits: Record<string, unknown>[];
  query: string | null;
  emptyNote: string;
}> = ({ hits, query, emptyNote }) => {
  if (hits.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
        {emptyNote}
      </p>
    );
  }
  const top = topScoreOf(hits);
  return (
    <div className="space-y-2">
      {hits.map((hit, index) => (
        <RagKindNested
          key={text(hit.chunk_id) ?? index}
          value={hit}
          rank={index + 1}
          topScore={top}
          query={query}
          variant="expanded"
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// rag_search_result
// ─────────────────────────────────────────────────────────────────────────────

export function RagSearchResultBlock({ serverData, className }: RagBlockProps) {
  const { value } = readSearchKindValue<"rag_search_result">(serverData);
  // The post-cutover half of the shape (see the header). One cast, one reason.
  const raw = value as unknown as Record<string, unknown>;

  const query = text(value.query);
  const hits = records(value.hits);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <SectionHeading
          icon={Search}
          label={query ? `Knowledge base — “${query}”` : "Knowledge base search"}
        />
        <RagChip title="Passages returned">
          {hits.length} {hits.length === 1 ? "passage" : "passages"}
        </RagChip>
      </div>

      <RetrievalDiagnosticsPanel
        diagnostics={raw.diagnostics}
        fallback={{
          totalCandidates: num(value.total_candidates),
          embeddingModel: text(value.embedding_model),
          rerankerModel: text(value.reranker_model),
          latencyMs: num(value.latency_ms),
        }}
      />

      <HitList
        hits={hits}
        query={query}
        emptyNote="This search really returned nothing — an honest empty result, not a failure. Open “Why these results” above to see which lanes proposed candidates."
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// rag_cross_doc_search_result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SECTIONED, NEVER FLATTENED. Merging the two corpora into one ranked list
 * would answer "which corpus did this come from?" with a guess, and knowing
 * which one answered is the entire point of searching two.
 */
export function RagCrossDocSearchResultBlock({ serverData, className }: RagBlockProps) {
  const { value } = readSearchKindValue<"rag_cross_doc_search_result">(serverData);
  const raw = value as unknown as Record<string, unknown>;

  const libraryQuery = text(value.library_query);
  const caseQuery = text(value.case_query);
  const libraryHits = records(value.library_hits);
  const caseHits = records(value.case_hits);

  return (
    <div className={cn("space-y-4", className)}>
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SectionHeading
            icon={BookOpenText}
            label={
              libraryQuery
                ? `Curated library — “${libraryQuery}”`
                : "Curated library"
            }
          />
          <RagChip>{libraryHits.length}</RagChip>
        </div>
        <RetrievalDiagnosticsPanel
          diagnostics={raw.library_diagnostics}
          fallback={{ latencyMs: num(value.library_latency_ms) }}
        />
        <HitList
          hits={libraryHits}
          query={libraryQuery}
          emptyNote="The curated library returned nothing for this query."
        />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SectionHeading
            icon={Layers}
            label={
              caseQuery
                ? `Your own documents — “${caseQuery}”`
                : "Your own documents"
            }
          />
          <RagChip>{caseHits.length}</RagChip>
        </div>
        <RetrievalDiagnosticsPanel
          diagnostics={raw.case_diagnostics}
          fallback={{ latencyMs: num(value.case_latency_ms) }}
        />
        <HitList
          hits={caseHits}
          query={caseQuery}
          emptyNote="Your own documents returned nothing for this query."
        />
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// rag_synthesize_result — the grounded answer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `rag_synthesize_result` — an answer, and what it stood on.
 *
 * THE HEADLINE OF THIS RUN. Measured on a real grounded answer: the output
 * carried five bare chunk UUIDs and nothing else — no title, no URL, no page. A
 * reader could not check a single claim without a lookup they had no way to
 * perform. `citations` (added additively at registry v4) is a list of
 * `source_ref`, so every source under the answer is a REAL, openable source
 * rendered by the `source_ref` component.
 *
 * `unsupported_claims` renders as a WARNING, never as an omission: "empty is a
 * claim; absent is not". When the writer says it could not ground something,
 * hiding that is the one thing a grounded-answer surface must never do.
 */
export function RagSynthesizeResultBlock({ serverData, className }: RagBlockProps) {
  const { value } = readSearchKindValue<"rag_synthesize_result">(serverData);

  const answer = text(value.answer);
  const question = text(value.question);
  const model = text(value.model);
  const citations = records(value.citations);
  const usedChunkIds = strings(value.used_chunk_ids);
  const unsupported = strings(value.unsupported_claims);
  // Chunk ids the answer used that no citation covers — the residue of the
  // machine join key, shown rather than swallowed.
  const uncitedChunks = usedChunkIds.length > 0 && citations.length === 0 ? usedChunkIds : [];

  if (!answer && citations.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {question && (
        <div className="flex items-start gap-2 text-sm font-medium text-foreground">
          <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {question}
        </div>
      )}

      {answer && (
        <div className="rounded-lg border border-border bg-card p-3">
          <BasicMarkdownContent content={answer} />
        </div>
      )}

      {unsupported.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <TriangleAlert className="h-4 w-4 text-warning" />
            The writer could not ground {unsupported.length}{" "}
            {unsupported.length === 1 ? "claim" : "claims"}
          </div>
          <ul className="mt-1 list-disc pl-6 text-xs text-muted-foreground">
            {unsupported.map((claim, index) => (
              <li key={index}>{claim}</li>
            ))}
          </ul>
        </div>
      )}

      {citations.length > 0 && (
        <div className="space-y-1.5">
          <SectionHeading
            icon={BookOpenText}
            label="Sources this answer stands on"
          />
          <div className="space-y-1.5">
            {citations.map((citation, index) => (
              <RagKindNested
                key={
                  (isRecord(citation) ? text(citation.source_id) : null) ??
                  `citation-${index}`
                }
                value={citation}
                variant="card"
                number={index + 1}
                query={question}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {model && <RagChip title="The model that wrote the answer">{model}</RagChip>}
        {usedChunkIds.length > 0 && (
          <RagChip title="The machine join key back to the retrieved passages">
            {usedChunkIds.length} passage{usedChunkIds.length === 1 ? "" : "s"} used
          </RagChip>
        )}
      </div>

      {uncitedChunks.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          This answer reports the passages it used but carries no structured
          citations — a reader cannot open any of them. That is the gap{" "}
          <code>citations</code> exists to close; a producer that fills only{" "}
          <code>used_chunk_ids</code> has not been cut over yet.
        </p>
      )}
    </div>
  );
}
