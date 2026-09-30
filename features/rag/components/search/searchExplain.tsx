"use client";

/**
 * The search explanation pieces, shared by the Search Lab and the Knowledge hub so a person
 * reads the SAME words in both places: the summary line over results ("25 hits · 131
 * candidates · reranked"), which typed words actually landed in the results, and — per
 * result — why it matched. Computed from what the search returned (never a corpus count),
 * and honest about what is missing.
 */

import { Badge } from "@/components/ui/badge";
import { getHighlightTerms } from "@/features/rag/components/hit-card/query-highlighting";
import { scoreTier } from "@/features/rag/components/hit-card/scoreTier";

// ─── The summary line ───────────────────────────────────────────────────────

export interface SearchSummary {
  hits: number;
  /** Passages the search recalled before it kept the best; null when the search did not say. */
  candidates: number | null;
  latencyMs?: number | null;
  /** The relevance model that re-ordered the results, or a plain "reranked". */
  reranked?: string | boolean | null;
}

/** "25 hits · 131 candidates · 412 ms · reranked" as parts, so a surface can add its own. */
export function searchSummaryParts(s: SearchSummary): string[] {
  const parts = [`${s.hits} ${s.hits === 1 ? "hit" : "hits"}`];
  if (typeof s.candidates === "number") parts.push(`${s.candidates} ${s.candidates === 1 ? "candidate" : "candidates"}`);
  if (typeof s.latencyMs === "number") parts.push(`${s.latencyMs} ms`);
  if (typeof s.reranked === "string" && s.reranked) parts.push(`reranked by ${s.reranked}`);
  else if (s.reranked === true) parts.push("reranked");
  return parts;
}

export function SearchSummaryText({ summary }: { summary: SearchSummary }) {
  return <>{searchSummaryParts(summary).join(" · ")}</>;
}

// ─── Query-term coverage ────────────────────────────────────────────────────

export interface TermCount {
  term: string;
  count: number;
}

/**
 * How many of the returned passages contain each typed word. `null` when there is nothing to
 * say (fewer than two meaningful words, or no results).
 */
export function termCoverage(query: string, snippets: (string | null | undefined)[]): TermCount[] | null {
  const terms = getHighlightTerms(query);
  if (terms.length < 2 || snippets.length === 0) return null;
  const haystacks = snippets.map((s) => (s ?? "").toLowerCase());
  return terms.map((term) => ({ term, count: haystacks.filter((s) => s.includes(term)).length }));
}

/** "Terms in results": a chip per typed word with how many results contain it. */
export function QueryTermCoverage({ query, hits }: { query: string; hits: { snippet: string | null }[] }) {
  const coverage = termCoverage(query, hits.map((h) => h.snippet));
  if (!coverage) return null;
  const missing = coverage.filter((c) => c.count === 0);
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
      <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Terms in results</span>
      {coverage.map((c) => (
        <Badge
          key={c.term}
          variant={c.count === 0 ? "warning" : "secondary"}
          className="text-[10px] px-1.5 py-0 font-normal"
          title={
            c.count === 0
              ? `"${c.term}" did not appear in any returned result — these hits matched on the other terms or on meaning, not this word.`
              : `"${c.term}" appears in ${c.count} of ${hits.length} results.`
          }
        >
          {c.term} {c.count}
        </Badge>
      ))}
      {missing.length > 0 && (
        <span className="text-muted-foreground/80">
          · {missing.length} term{missing.length === 1 ? "" : "s"} matched nothing here
        </span>
      )}
    </div>
  );
}

/** The coverage as one quiet run of text: `'perceive' 0, 'acceleration' 24`. */
export function termCoverageText(coverage: TermCount[]): string {
  return coverage.map((c) => `'${c.term}' ${c.count}`).join(", ");
}

// ─── Why one result matched ─────────────────────────────────────────────────

export interface WhyMatchedInput {
  snippet?: string | null;
  /** Rank in the meaning (vector) lane; null/absent = that lane did not find it. */
  vector_rank?: number | null;
  /** Rank in the word (lexical) lane. */
  lexical_rank?: number | null;
  rerank_score?: number | null;
  score?: number | null;
}

export interface WhyMatchedFacts {
  /** Typed words found in the passage, and typed words not found in it. */
  found: string[];
  absent: string[];
  lanes: string[];
  relevance: { label: string; score: number } | null;
}

export function whyMatched(hit: WhyMatchedInput, query: string): WhyMatchedFacts {
  const terms = getHighlightTerms(query);
  const text = (hit.snippet ?? "").toLowerCase();
  const found = terms.filter((t) => text.includes(t));
  const absent = terms.filter((t) => !text.includes(t));
  const lanes: string[] = [];
  if (hit.vector_rank != null) lanes.push(`by meaning (#${hit.vector_rank})`);
  if (hit.lexical_rank != null) lanes.push(`by words (#${hit.lexical_rank})`);
  const score = hit.rerank_score ?? hit.score ?? null;
  return {
    found,
    absent,
    lanes,
    relevance: typeof score === "number" ? { label: scoreTier(score).label, score } : null,
  };
}

/** A short reveal under a result: the words that landed, the lanes that found it, how relevant. */
export function WhyMatched({ hit, query }: { hit: WhyMatchedInput; query: string }) {
  const f = whyMatched(hit, query);
  return (
    <dl
      className="space-y-0.5 rounded-md bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground"
      data-testid="why-matched"
    >
      {f.found.length || f.absent.length ? (
        <div>
          <dt className="inline font-medium text-foreground">Words: </dt>
          <dd className="inline">
            {f.found.length ? <span>{f.found.join(", ")} found</span> : <span>none of your words appear in this passage</span>}
            {f.absent.length && f.found.length ? <span> · {f.absent.join(", ")} not in this passage</span> : null}
          </dd>
        </div>
      ) : null}
      <div>
        <dt className="inline font-medium text-foreground">Found: </dt>
        <dd className="inline">
          {f.lanes.length ? f.lanes.join(" and ") : "the search did not record which way this was found"}
        </dd>
      </div>
      {f.relevance ? (
        <div>
          <dt className="inline font-medium text-foreground">Relevance: </dt>
          <dd className="inline tabular-nums">
            {f.relevance.label} ({f.relevance.score.toFixed(2)})
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
