"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { ExternalLink, ArrowUpRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthorityTierBadge } from "../sources/AuthorityTierBadge";
import { SourceFavicon } from "./SourceFavicon";
import { resolveTier, TIER_VISUALS } from "./resultsShared";
import type { ResearchSource } from "../../types";

const MAX_CARDS = 8;

/**
 * Section c — the highest-authority sources as rich cards. Each card shows the
 * structured authority fields distinctly (score number, colored tier badge,
 * reasoning sentence) plus a Visit link and an in-app detail link.
 */
export function TopSourcesGrid({
  sources,
  topicId,
}: {
  sources: ResearchSource[];
  topicId: string;
}) {
  const top = useMemo(() => {
    return sources
      .filter(
        (s) =>
          (s.is_included ?? false) &&
          s.authority_score != null &&
          resolveTier(s.authority_tier, s.authority_score) != null,
      )
      .sort((a, b) => (b.authority_score ?? 0) - (a.authority_score ?? 0))
      .slice(0, MAX_CARDS);
  }, [sources]);

  if (top.length === 0) return null;

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-2">
        <Star className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold tracking-tight">Top Sources</h2>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
          {top.length}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {top.map((source, index) => (
          <TopSourceCard
            key={source.id}
            source={source}
            index={index}
            topicId={topicId}
          />
        ))}
      </div>
    </section>
  );
}

function TopSourceCard({
  source,
  index,
  topicId,
}: {
  source: ResearchSource;
  index: number;
  topicId: string;
}) {
  const score = source.authority_score as number;
  const tier = resolveTier(source.authority_tier, score)!;
  const visual = TIER_VISUALS[tier];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        delay: (index % 3) * 0.05,
        type: "spring",
        stiffness: 240,
        damping: 26,
      }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border/50 bg-card/40 p-4 backdrop-blur-sm",
        "transition-colors hover:border-border",
      )}
    >
      {/* tier accent stripe along the top edge */}
      <div className={cn("absolute inset-x-0 top-0 h-0.5", visual.barClass)} />

      <div className="flex items-start gap-3">
        <SourceFavicon
          hostname={source.hostname}
          thumbnailUrl={source.thumbnail_url}
          className="h-9 w-9 shrink-0 p-1 border border-border/40"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-muted-foreground">
            {source.hostname ?? "unknown source"}
          </div>
          <Link
            href={`/research/topics/${topicId}/sources/${source.id}`}
            className="mt-0.5 line-clamp-2 text-sm font-semibold text-foreground hover:text-primary"
          >
            {source.title ?? source.url}
          </Link>
        </div>
        <div
          className={cn(
            "shrink-0 text-2xl font-bold leading-none tabular-nums",
            visual.scoreClass,
          )}
        >
          {score}
        </div>
      </div>

      <div className="mt-2">
        <AuthorityTierBadge
          score={score}
          tier={source.authority_tier}
          reasoning={source.authority_reasoning}
        />
      </div>

      {source.authority_reasoning && (
        <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground/85">
          {source.authority_reasoning}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2.5">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          Visit
        </a>
        <Link
          href={`/research/topics/${topicId}/sources/${source.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary/80 transition-colors hover:text-primary"
        >
          Details
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </motion.div>
  );
}
