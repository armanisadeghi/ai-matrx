"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Search,
  Layers,
  ChevronDown,
  ChevronUp,
  Globe,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import MarkdownStream from "@/components/MarkdownStream";
import { fmtCount } from "../../format";
import {
  useResearchKeywords,
  useResearchSources,
  useResearchSynthesis,
  useSourceImportance,
} from "../../hooks/useResearchState";
import { SourceResultsTable } from "../sources/SourceResultsTable";
import type { ResearchSource, ResearchSynthesis } from "../../types";

/**
 * The home for a single keyword: its synthesis, plus its search results
 * (ranked by this keyword's search position) with scrape status — so a user
 * can judge whether THIS keyword is carrying the research, independent of the
 * others picked alongside it.
 */

// How many ranked results render before the "Show all" expander.
const INLINE_RESULTS = 4;

export function KeywordDetailView({
  topicId,
  keywordId,
}: {
  topicId: string;
  keywordId: string;
}) {
  const router = useRouter();
  const [resultsExpanded, setResultsExpanded] = useState(false);

  const { data: keywords } = useResearchKeywords(topicId);
  const { data: sources, isLoading: srcLoading } = useResearchSources(topicId, {
    keyword_id: keywordId,
  });
  const { data: syntheses } = useResearchSynthesis(topicId, {
    keyword_id: keywordId,
  });
  const { data: importanceMap } = useSourceImportance(topicId);

  const keyword = (keywords ?? []).find((k) => k.id === keywordId);
  const synthList = (syntheses ?? []) as ResearchSynthesis[];

  const rankFor = (sourceId: string) =>
    importanceMap
      ?.get(sourceId)
      ?.perKeyword.find((k) => k.keyword_id === keywordId)?.rank ?? null;

  const srcList = [...((sources ?? []) as ResearchSource[])].sort((a, b) => {
    const ra = rankFor(a.id) ?? Number.POSITIVE_INFINITY;
    const rb = rankFor(b.id) ?? Number.POSITIVE_INFINITY;
    return ra - rb;
  });

  const goodScrapes = srcList.filter(
    (s) => s.scrape_status === "complete" || s.scrape_status === "success",
  ).length;

  // Top results show by default; the rest sit behind the bottom expander.
  const visibleSrc =
    resultsExpanded || srcList.length <= INLINE_RESULTS
      ? srcList
      : srcList.slice(0, INLINE_RESULTS);
  const hiddenSrc = srcList.length - visibleSrc.length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border/40 bg-card/30 px-3 sm:px-4 py-2.5">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors -ml-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Keywords
        </button>
        <div className="flex items-center gap-2 mt-1">
          <Search className="h-4 w-4 text-primary shrink-0" />
          <h1 className="text-base font-semibold truncate">
            {keyword?.keyword ?? "Keyword"}
          </h1>
          {keyword?.is_stale && (
            <Badge variant="secondary" className="text-[10px]">
              Stale
            </Badge>
          )}
        </div>
        {/* Prominent metrics — the expensive work behind this keyword. */}
        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:max-w-md">
          <HeaderStat
            icon={Globe}
            value={fmtCount(srcList.length)}
            label="Sources"
            tint="text-primary"
          />
          <HeaderStat
            icon={BookOpen}
            value={fmtCount(goodScrapes)}
            label="Pages read"
            tint="text-green-600 dark:text-green-400"
          />
          <HeaderStat
            icon={Layers}
            value={fmtCount(synthList.length)}
            label="Syntheses"
            tint="text-blue-600 dark:text-blue-400"
          />
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
          {keyword?.search_provider && <span>{keyword.search_provider}</span>}
          {keyword?.last_searched_at && (
            <span>
              searched {new Date(keyword.last_searched_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-5">
        {/* Synthesis for this keyword — the distilled output */}
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Synthesis
            </span>
          </div>
          {synthList.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No synthesis for this keyword yet — run synthesis to distill its
              sources.
            </p>
          ) : (
            synthList.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-border/50 bg-card/60 p-3"
              >
                {s.result ? (
                  <MarkdownStream content={s.result} />
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Completed with no text output.
                  </p>
                )}
              </div>
            ))
          )}
        </section>

        {/* Search + scrape results, ranked by this keyword's search position */}
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Search className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Search results
            </span>
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
              {srcList.length}
            </Badge>
          </div>

          {srcLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : srcList.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No sources found for this keyword yet.
            </p>
          ) : (
            <div>
              {/* Top results render by default; fade hints at the rest. */}
              <div className="relative">
                <SourceResultsTable
                  sources={visibleSrc}
                  topicId={topicId}
                  rankFor={(s) => rankFor(s.id)}
                />
                {!resultsExpanded && hiddenSrc > 0 && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-background rounded-b-lg" />
                )}
              </div>
              {srcList.length > INLINE_RESULTS && (
                <div className="mt-2 flex justify-center">
                  <button
                    onClick={() => setResultsExpanded((v) => !v)}
                    aria-expanded={resultsExpanded}
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                  >
                    {resultsExpanded ? (
                      <>
                        Show less
                        <ChevronUp className="h-3.5 w-3.5" />
                      </>
                    ) : (
                      <>
                        Show all {srcList.length} results
                        <ChevronDown className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * A single prominent metric tile for the keyword header — big tabular number,
 * quiet label, subtle icon — matching the research stat-tile language.
 */
function HeaderStat({
  icon: Icon,
  value,
  label,
  tint,
}: {
  icon: typeof Globe;
  value: string;
  label: string;
  tint: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", tint)} />
        <span className="text-xl font-bold leading-none tabular-nums">
          {value}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-none text-muted-foreground truncate">
        {label}
      </p>
    </div>
  );
}
