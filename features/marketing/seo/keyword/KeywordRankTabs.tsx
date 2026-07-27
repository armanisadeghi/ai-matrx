"use client";

/**
 * Keyword Intelligence — Rankings + SERP tabs.
 *
 * Both reuse the canonical rank-tracking data layer
 * (`features/marketing/components/ranks/useRanks.ts` → aidream
 * `/seo/sites/{id}/rank-targets` family) — no forked fetch paths. The SERP
 * tab renders the stored landscape as a Google-style results page via the
 * canonical `SerpResult` (features/marketing/seo/serp), with the site's own
 * result highlighted.
 */

import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Crosshair,
  Loader2,
  Minus,
  Play,
  Plus,
  SearchX,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { formatDate } from "@/features/marketing/components/shared/MarketingUi";
import {
  usePortfolio,
  useRankTargetHistory,
  useRunRankCheck,
} from "@/features/marketing/components/ranks/useRanks";
import type { RankPortfolioItem } from "@/features/marketing/components/ranks/types";
import { SerpResult } from "@/features/marketing/seo/serp/SerpResult";

import { normalizeKeywordPhrase } from "./data";

/** The portfolio rows tracking THIS keyword (id match first, phrase fallback). */
function matchingTargets(
  items: RankPortfolioItem[],
  phrase: string,
  keywordId: string | null,
): RankPortfolioItem[] {
  const normalized = normalizeKeywordPhrase(phrase);
  return items.filter(
    (item) =>
      (keywordId && item.keyword_id === keywordId) ||
      normalizeKeywordPhrase(item.keyword) === normalized,
  );
}

function MovementGlyph({ movement }: { movement: number | null }) {
  if (movement === null || movement === 0) {
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  }
  // Positive movement = improved (numerically lower position).
  return movement > 0 ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success">
      <ArrowUpRight className="h-3 w-3" />
      {movement}
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive">
      <ArrowDownRight className="h-3 w-3" />
      {Math.abs(movement)}
    </span>
  );
}

export function KeywordRankingsTab({
  siteId,
  organizationId,
  phrase,
  keywordId,
}: {
  siteId: string;
  organizationId: string;
  phrase: string;
  keywordId: string | null;
}) {
  const portfolio = usePortfolio(siteId, organizationId);
  const rankCheck = useRunRankCheck(() => void portfolio.reload());
  const [adding, setAdding] = useState(false);
  const targets = matchingTargets(portfolio.items, phrase, keywordId);

  const trackKeyword = async () => {
    setAdding(true);
    try {
      const item = await portfolio.addTarget({
        keyword: phrase.trim(),
        provider: "brave",
      });
      toast.success(`Now tracking “${item.keyword}”`);
      // Give the fresh target an immediate first reading.
      void rankCheck.run(item.target_id);
    } catch (error) {
      toast.error("Could not add rank target", {
        description: extractErrorMessage(error),
      });
    } finally {
      setAdding(false);
    }
  };

  if (portfolio.loading && portfolio.items.length === 0) {
    return (
      <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  if (portfolio.error) {
    return <p className="p-4 text-xs text-destructive">{portfolio.error}</p>;
  }

  if (targets.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-6 text-center">
        <Crosshair className="h-6 w-6 text-muted-foreground" />
        <p className="max-w-sm text-xs text-muted-foreground">
          This keyword is not rank-tracked for this site yet. Tracking runs a
          real SERP check now and on a schedule, building position history and
          the competitive landscape.
        </p>
        <Button size="sm" className="h-8" disabled={adding} onClick={() => void trackKeyword()}>
          {adding ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Track this keyword
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      {targets.map((item) => {
        const state = rankCheck.checking[item.target_id];
        return (
          <div
            key={item.target_id}
            className="rounded-lg border border-border p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-semibold tabular-nums text-foreground">
                {item.latest_position ?? "—"}
              </span>
              <MovementGlyph movement={item.movement} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {item.provider} · {item.device} · {item.language}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  best {item.best_position ?? "—"} · checked{" "}
                  {item.last_checked_at
                    ? formatDate(item.last_checked_at)
                    : "never"}{" "}
                  · every {item.cadence_days}d
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                {!item.is_active ? (
                  <Badge variant="outline" className="text-[10px]">
                    Paused
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  disabled={state?.status === "running"}
                  onClick={() => void rankCheck.run(item.target_id)}
                >
                  {state?.status === "running" ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 h-3 w-3" />
                  )}
                  Check now
                </Button>
              </div>
            </div>
            {state?.status === "running" && state.stage ? (
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {state.stage}
              </p>
            ) : null}
            {state?.status === "error" ? (
              <p className="mt-1.5 text-[10px] text-destructive">
                {state.error}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function KeywordSerpTab({
  siteId,
  organizationId,
  phrase,
  keywordId,
}: {
  siteId: string;
  organizationId: string;
  phrase: string;
  keywordId: string | null;
}) {
  const portfolio = usePortfolio(siteId, organizationId);
  const targets = matchingTargets(portfolio.items, phrase, keywordId);
  // The freshest checked target owns the landscape.
  const target =
    [...targets].sort((a, b) =>
      (b.last_checked_at ?? "").localeCompare(a.last_checked_at ?? ""),
    )[0] ?? null;
  const history = useRankTargetHistory(target?.target_id ?? null);

  if (portfolio.loading && portfolio.items.length === 0) {
    return (
      <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  if (!target) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-center">
        <SearchX className="h-5 w-5 text-muted-foreground" />
        <p className="max-w-sm text-xs text-muted-foreground">
          No SERP evidence yet — track this keyword in the Rankings tab and run
          a check to capture the live results page.
        </p>
      </div>
    );
  }
  if (history.loading) {
    return (
      <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  if (history.error) {
    return <p className="p-4 text-xs text-destructive">{history.error}</p>;
  }
  const landscape = history.landscape;
  if (!landscape || landscape.results.length === 0) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        No stored SERP snapshot for this target yet — run a check from the
        Rankings tab.
      </p>
    );
  }

  const ownDomain = target.target_domain?.replace(/^www\./, "") ?? null;

  return (
    <div className="grid gap-2">
      <p className="text-[10px] text-muted-foreground">
        Google results for “{target.keyword}” as observed{" "}
        {landscape.observed_at ? formatDate(landscape.observed_at) : "recently"}{" "}
        via {target.provider} ({target.device}).
      </p>
      <ol className="grid gap-1.5">
        {landscape.results.map((result) => {
          const isOwn =
            ownDomain !== null &&
            (result.domain ?? "").replace(/^www\./, "") === ownDomain;
          return (
            <li
              key={`${result.absolute_rank}:${result.url ?? result.title}`}
              className={cn(
                "flex gap-3 rounded-lg border px-3 py-2",
                isOwn
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-background",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 w-6 shrink-0 text-right text-sm font-semibold tabular-nums",
                  isOwn ? "text-primary" : "text-muted-foreground",
                )}
              >
                {result.organic_rank ?? result.absolute_rank}
              </span>
              <div className="min-w-0 flex-1">
                <SerpResult
                  url={result.url ?? undefined}
                  title={result.title ?? undefined}
                  description={result.snippet ?? undefined}
                  density="compact"
                  placeholderTitle="(untitled result)"
                  placeholderDescription={null}
                />
                <div className="mt-0.5 flex items-center gap-1.5">
                  {isOwn ? (
                    <Badge variant="success" className="text-[9px]">
                      Your site
                    </Badge>
                  ) : null}
                  {result.result_type !== "organic" ? (
                    <Badge variant="outline" className="text-[9px]">
                      {result.result_type.replaceAll("_", " ")}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
