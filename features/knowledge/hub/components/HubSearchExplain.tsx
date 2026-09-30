"use client";

/**
 * What the search just did, said quietly above the results and under each passage — built from
 * the Search Lab's own pieces (`features/rag/components/search/searchExplain`), so the hub and
 * the lab use the same words and the same math.
 */

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import type { SectionState } from "@/features/knowledge/hub/hooks/useKnowledgeResults";
import {
  SearchSummaryText,
  WhyMatched,
  termCoverage,
  termCoverageText,
} from "@/features/rag/components/search/searchExplain";

const RERANK_SKIPPED: Record<string, string> = {
  timeout: "rerank skipped: slow",
  failed: "rerank failed — fusion order",
  low_confidence: "rerank skipped: low confidence",
};

/** "25 hits · 131 candidates · reranked · 'perceive' 0, 'acceleration' 24" — over the results. */
export function SearchExplainHeader({ text, sections }: { text: string; sections: SectionState[] }) {
  const segments = sections.find((s) => s.key === "segments");
  if (!text.trim() || !segments || segments.status !== "ready" || !segments.section) return null;
  const sec = segments.section;
  const coverage = termCoverage(text, sec.items.map((h) => h.snippet));
  const others = sections
    .filter((s) => s.key !== "segments" && s.key !== "top_hit")
    .reduce((n, s) => n + (s.section?.items.length ?? 0), 0);
  const skipped = sec.rerank_status ? RERANK_SKIPPED[sec.rerank_status] : undefined;
  return (
    <p
      className="px-2 pb-3 text-xs tabular-nums text-muted-foreground"
      data-testid="search-explain-header"
      title="Passages the search returned, how many it looked at before keeping the best, and how many of the passages contain each of your words."
    >
      <SearchSummaryText
        summary={{
          hits: sec.items.length,
          candidates: typeof sec.count === "number" ? sec.count : null,
          reranked: sec.reranker_model ? true : null,
        }}
      />
      {skipped ? <span className="text-amber-600 dark:text-amber-500"> · {skipped}</span> : null}
      {coverage ? <span> · {termCoverageText(coverage)}</span> : null}
      {others > 0 ? <span> · plus {others} in other sections</span> : null}
    </p>
  );
}

/**
 * A "Why matched" button on a result whose text came from a passage; it opens the reveal in a
 * popover so the row keeps its height (the list is windowed on row height).
 */
export function WhyMatchedPopover({ hit, text }: { hit: KnowledgeHit; text: string }) {
  if (!text.trim()) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          data-testid="why-matched-toggle"
        >
          Why matched
        </button>
      </PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — a short explanation; a steady measure keeps the lines readable */
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <WhyMatched hit={hit} query={text} />
      </PopoverContent>
    </Popover>
  );
}
