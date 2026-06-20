"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { Trophy, Sparkles, ArrowRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useTopicContext } from "../../context/ResearchContext";
import { useResearchSources } from "../../hooks/useResearchState";
import { useResearchMedia } from "../../hooks/useResearchState";
import { useCostSummary } from "../../hooks/useCostSummary";
import { resolveTier } from "./resultsShared";
import {
  ResultsHeroMetrics,
  buildHeroMetrics,
} from "./ResultsHeroMetrics";
import { AuthorityRankingViz } from "./AuthorityRankingViz";
import { TopSourcesGrid } from "./TopSourcesGrid";
import { ResultsMediaBand } from "./ResultsMediaBand";

/**
 * The marquee "Results" page. Every number and row is rebuilt from the DB
 * hooks below, so a cold page refresh renders an identical page — that is the
 * whole point (it fixes "refresh destroys the results UI").
 */
export default function ResultsShowcase() {
  const { topicId, topic, progress } = useTopicContext();

  // All sources for the topic — the ranking viz / grid filter to included +
  // scored ones themselves. A generous limit so the showcase is complete.
  const { data: sources, isLoading: sourcesLoading } = useResearchSources(
    topicId,
    { limit: 500, offset: 0 },
  );
  const { data: media, isLoading: mediaLoading } = useResearchMedia(topicId);
  const { data: costs, isLoading: costsLoading } = useCostSummary(topicId);

  const rankedCount = useMemo(() => {
    if (!sources) return 0;
    return sources.filter(
      (s) =>
        (s.is_included ?? false) &&
        s.authority_score != null &&
        resolveTier(s.authority_tier, s.authority_score) != null,
    ).length;
  }, [sources]);

  const metrics = useMemo(() => {
    const inputTokens = costs?.total_input_tokens ?? 0;
    const outputTokens = costs?.total_output_tokens ?? 0;
    const reports =
      (progress?.keyword_syntheses ?? 0) +
      (progress?.project_syntheses ?? 0) +
      (progress?.total_documents ?? 0);
    return buildHeroMetrics({
      sources: progress?.total_sources ?? sources?.length ?? 0,
      includedSources: progress?.included_sources ?? 0,
      pagesRead: progress?.total_content ?? 0,
      // "Characters processed" — derived from the tokens the models consumed
      // and produced (≈4 chars / token). Honest proxy, large & impressive.
      characters: (inputTokens + outputTokens) * 4,
      analyses: progress?.total_analyses ?? 0,
      reports,
      totalCostUsd: costs?.total_estimated_cost_usd ?? 0,
      llmCalls: costs?.total_llm_calls ?? 0,
    });
  }, [progress, sources, costs]);

  const isLoading = sourcesLoading || costsLoading;
  const topicName = topic?.name ?? "Research";

  // Cold-load skeleton — never a perpetual spinner.
  if (isLoading && !sources) {
    return <ResultsSkeleton />;
  }

  const hasRankedSources = rankedCount > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-3 py-4 sm:px-5 sm:py-6">
      {/* Page header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-1"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-emerald-500/20 ring-1 ring-amber-500/20">
            <Trophy className="h-4.5 w-4.5 text-amber-500" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Results
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          What the research uncovered for{" "}
          <span className="font-medium text-foreground">{topicName}</span> —
          ranked, scored, and ready.
        </p>
      </motion.header>

      {/* a. Hero metrics band */}
      <ResultsHeroMetrics metrics={metrics} />

      {hasRankedSources ? (
        <>
          {/* b. Animated authority ranking — the centerpiece */}
          {sources && (
            <AuthorityRankingViz sources={sources} topicId={topicId} />
          )}

          {/* c. Top sources grid */}
          {sources && <TopSourcesGrid sources={sources} topicId={topicId} />}
        </>
      ) : (
        <RankingEmptyState topicId={topicId} loading={sourcesLoading} />
      )}

      {/* d. Rich media band — self-skips when there are no images */}
      {!mediaLoading && media && (
        <ResultsMediaBand media={media} topicId={topicId} />
      )}
    </div>
  );
}

// ============================================================================
// Empty state — honest, actionable, never a spinner.
// ============================================================================

function RankingEmptyState({
  topicId,
  loading,
}: {
  topicId: string;
  loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-14 text-center backdrop-blur-sm",
      )}
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
        {loading ? (
          <Sparkles className="h-6 w-6 animate-pulse text-muted-foreground" />
        ) : (
          <Inbox className="h-6 w-6 text-muted-foreground" />
        )}
      </span>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">
          {loading ? "Loading sources…" : "No ranked sources yet"}
        </h3>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {loading
            ? "Fetching this topic's sources."
            : "Run the pipeline to search, scrape, and score sources by authority. Ranked results appear here automatically."}
        </p>
      </div>
      {!loading && (
        <Link
          href={`/research/topics/${topicId}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Go to overview
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </motion.div>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================

function ResultsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-3 py-4 sm:px-5 sm:py-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-28 rounded-2xl", (i === 0 || i === 5) && "sm:col-span-2")}
          />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
