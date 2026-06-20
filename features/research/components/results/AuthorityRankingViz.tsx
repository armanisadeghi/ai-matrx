"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { ExternalLink, TrendingUp, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthorityTierBadge } from "../sources/AuthorityTierBadge";
import { SourceFavicon } from "./SourceFavicon";
import {
  resolveTier,
  TIER_VISUALS,
  type AuthorityTier,
} from "./resultsShared";
import type { ResearchSource } from "../../types";

interface RankedSource {
  source: ResearchSource;
  score: number;
  tier: AuthorityTier;
  rank: number;
}

/**
 * THE centerpiece (results issue #1). Included sources that carry an
 * authority_score, sorted by score DESC, rendered as a ranked bar list that
 * animates into place on mount: high-authority rows glow emerald→sky and
 * settle at the top, low-authority rows tint rose and sink to the bottom.
 *
 * authority_score, authority_tier, and authority_reasoning stay THREE
 * distinct, separately-rendered fields — a number, a colored tier badge, and
 * the full reasoning sentence — never concatenated.
 */
export function AuthorityRankingViz({
  sources,
  topicId,
}: {
  sources: ResearchSource[];
  topicId: string;
}) {
  const ranked = useMemo<RankedSource[]>(() => {
    const withScore = sources.filter(
      (s) =>
        (s.is_included ?? false) &&
        s.authority_score != null &&
        resolveTier(s.authority_tier, s.authority_score) != null,
    );
    withScore.sort(
      (a, b) => (b.authority_score ?? 0) - (a.authority_score ?? 0),
    );
    return withScore.map((source, i) => ({
      source,
      score: source.authority_score as number,
      tier: resolveTier(source.authority_tier, source.authority_score)!,
      rank: i + 1,
    }));
  }, [sources]);

  if (ranked.length === 0) return null;

  const topScore = ranked[0]?.score ?? 0;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-semibold tracking-tight">
            Authority Ranking
          </h2>
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
            {ranked.length} ranked
          </span>
        </div>
        <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
          <Award className="h-3.5 w-3.5 text-emerald-500" />
          Top score {topScore}/100
        </div>
      </header>

      <div className="space-y-2">
        {ranked.map((item, index) => (
          <AuthorityRow
            key={item.source.id}
            item={item}
            index={index}
            topicId={topicId}
          />
        ))}
      </div>
    </section>
  );
}

function AuthorityRow({
  item,
  index,
  topicId,
}: {
  item: RankedSource;
  index: number;
  topicId: string;
}) {
  const { source, score, tier, rank } = item;
  const visual = TIER_VISUALS[tier];
  const isHigh = tier === "high" && score >= 75;

  // Staggered, spring entrance. Higher-authority rows (lower index, at the
  // top) come in slightly sooner & from above; lower rows drift up from
  // below — so the list visibly "sorts" itself into rank order on mount.
  const delay = 0.12 + index * 0.07;

  return (
    <motion.div
      layout
      initial={{
        opacity: 0,
        y: tier === "low" ? 26 : -14,
        scale: 0.97,
        filter: "blur(4px)",
      }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{
        delay,
        type: "spring",
        stiffness: 200,
        damping: 24,
      }}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm",
        "px-3 py-2.5 sm:px-4 sm:py-3",
        visual.rowTintClass,
      )}
      style={isHigh ? { boxShadow: visual.glow } : undefined}
    >
      {/* Glow pulse-in for the top-tier rows so they read as "the winners". */}
      {isHigh && (
        <motion.span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-xl",
            visual.ringClass,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.5] }}
          transition={{ delay: delay + 0.1, duration: 0.9 }}
        />
      )}

      <div className="relative flex items-center gap-3">
        {/* Rank number */}
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums",
            rank <= 3
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted/60 text-muted-foreground",
          )}
        >
          {rank}
        </div>

        {/* Favicon */}
        <SourceFavicon
          hostname={source.hostname}
          thumbnailUrl={source.thumbnail_url}
          className="h-8 w-8 shrink-0 p-1 border border-border/40"
        />

        {/* Hostname + title + reasoning */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-medium text-muted-foreground">
              {source.hostname ?? "unknown source"}
            </span>
            <AuthorityTierBadge
              score={score}
              tier={source.authority_tier}
              reasoning={source.authority_reasoning}
            />
          </div>
          <div className="truncate text-sm font-medium text-foreground">
            {source.title ?? source.url}
          </div>
          {source.authority_reasoning && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground/80">
              {source.authority_reasoning}
            </p>
          )}
        </div>

        {/* Prominent score number */}
        <div className="flex shrink-0 flex-col items-end">
          <div
            className={cn(
              "text-2xl font-bold leading-none tabular-nums sm:text-3xl",
              visual.scoreClass,
            )}
          >
            {score}
          </div>
          <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground/60">
            / 100
          </div>
        </div>

        {/* Quick links */}
        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            href={`/research/topics/${topicId}/sources/${source.id}`}
            aria-label="Open source detail"
            className="rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <TrendingUp className="h-3.5 w-3.5" />
          </Link>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit source"
            className="rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Score bar — width = score%, colored by tier. Animates after the row
          lands so the bar "fills" to the score. */}
      <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
        <motion.div
          className={cn("h-full rounded-full", visual.barClass)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          transition={{ delay: delay + 0.25, duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}
