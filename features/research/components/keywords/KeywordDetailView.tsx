"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Search, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import MarkdownStream from "@/components/MarkdownStream";
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
export function KeywordDetailView({
  topicId,
  keywordId,
}: {
  topicId: string;
  keywordId: string;
}) {
  const router = useRouter();

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
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground mt-1">
          {keyword?.search_provider && <span>{keyword.search_provider}</span>}
          <span>{srcList.length} sources</span>
          <span>{goodScrapes} scraped</span>
          <span>{synthList.length} synthesis</span>
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
            <SourceResultsTable
              sources={srcList}
              topicId={topicId}
              rankFor={(s) => rankFor(s.id)}
            />
          )}
        </section>
      </div>
    </div>
  );
}
