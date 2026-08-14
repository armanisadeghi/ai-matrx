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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { formatDate } from "@/features/marketing/components/shared/MarketingUi";
import {
  usePortfolio,
  useRankTargetHistory,
  useRunRankCheck,
} from "@/features/marketing/components/ranks/useRanks";
import {
  TRACKING_MODES,
  trackingModeLabelForItem,
  type RankPortfolioItem,
} from "@/features/marketing/components/ranks/types";
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
  const [modeId, setModeId] = useState("google_national");
  const [locationName, setLocationName] = useState("");
  const targets = matchingTargets(portfolio.items, phrase, keywordId);
  const selectedMode = TRACKING_MODES.find((mode) => mode.id === modeId);

  const trackKeyword = async () => {
    if (!selectedMode) {
      toast.error("Choose where to track this keyword.");
      return;
    }
    if (selectedMode.location === "required" && !locationName.trim()) {
      toast.error(`${selectedMode.label} needs a city or location.`);
      return;
    }
    setAdding(true);
    try {
      const item = await portfolio.addTarget({
        keyword: phrase.trim(),
        provider: selectedMode.provider,
        engine: selectedMode.engine ?? undefined,
        search_type: selectedMode.search_type,
        location_name:
          selectedMode.location === "none"
            ? undefined
            : locationName.trim() || undefined,
      });
      toast.success(`Now tracking “${item.keyword}”`, {
        description:
          "Use Check now when you are ready to collect live results.",
      });
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

  return (
    <div className="grid gap-3">
      <div
        className={cn(
          "grid gap-3 rounded-lg border border-border p-3",
          targets.length === 0 && "border-dashed bg-muted/20",
        )}
      >
        <div className="flex items-start gap-2">
          <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
              {targets.length === 0
                ? "Choose where to track this keyword"
                : "Add another search view"}
            </p>
            <p className="text-[10px] leading-4 text-muted-foreground">
              Adding a target does not run a check. Use Check now when you want
              the first live result.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="grid min-w-0 gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">
              Search view
            </span>
            <Select
              value={modeId}
              onValueChange={(value) => {
                setModeId(value);
                const nextMode = TRACKING_MODES.find(
                  (mode) => mode.id === value,
                );
                if (nextMode?.location === "none") setLocationName("");
              }}
            >
              <SelectTrigger className="h-8 min-w-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRACKING_MODES.map((mode) => (
                  <SelectItem key={mode.id} value={mode.id} title={mode.hint}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">
              Location
              {selectedMode?.location === "required" ? " (required)" : ""}
            </span>
            <Input
              className="h-8 text-xs"
              value={locationName}
              onChange={(event) => setLocationName(event.target.value)}
              placeholder="Los Angeles, California"
              disabled={!selectedMode || selectedMode.location === "none"}
            />
          </div>
          <Button
            size="sm"
            className="h-8"
            disabled={adding || !selectedMode}
            onClick={() => void trackKeyword()}
          >
            {adding ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Add target
          </Button>
        </div>
        {selectedMode ? (
          <p className="text-[10px] leading-4 text-muted-foreground">
            {selectedMode.hint}
          </p>
        ) : null}
      </div>

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
                  {trackingModeLabelForItem(item)} · {item.device} ·{" "}
                  {item.language}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {item.location_name ? `${item.location_name} · ` : ""}
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
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const resultPageTargets = targets.filter(
    (item) => item.search_type !== "ai_answer",
  );
  const freshestTarget =
    [...resultPageTargets].sort((a, b) => {
      if (!a.last_checked_at && !b.last_checked_at) return 0;
      if (!a.last_checked_at) return 1;
      if (!b.last_checked_at) return -1;
      return b.last_checked_at.localeCompare(a.last_checked_at);
    })[0] ?? null;
  const target =
    resultPageTargets.find((item) => item.target_id === selectedTargetId) ??
    freshestTarget;
  const history = useRankTargetHistory(target?.target_id ?? null);

  if (portfolio.loading && portfolio.items.length === 0) {
    return (
      <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  if (portfolio.error) {
    return <p className="p-4 text-xs text-destructive">{portfolio.error}</p>;
  }
  if (!target) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-center">
        <SearchX className="h-5 w-5 text-muted-foreground" />
        <p className="max-w-sm text-xs text-muted-foreground">
          No stored result page yet. Add a Google or Brave search view in
          Rankings, then use Check now to collect it.
        </p>
      </div>
    );
  }
  const resultPageHeader = (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">Result page</p>
        <p className="text-[10px] text-muted-foreground">
          Rankings and result pages use the same stored observation.
        </p>
      </div>
      {resultPageTargets.length > 1 ? (
        <Select value={target.target_id} onValueChange={setSelectedTargetId}>
          <SelectTrigger className="h-8 w-full min-w-48 text-xs sm:w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {resultPageTargets.map((item) => (
              <SelectItem key={item.target_id} value={item.target_id}>
                {trackingModeLabelForItem(item)}
                {item.location_name ? ` — ${item.location_name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="outline" className="text-[10px]">
          {trackingModeLabelForItem(target)}
        </Badge>
      )}
    </div>
  );
  if (history.loading) {
    return (
      <div className="grid gap-3">
        {resultPageHeader}
        <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
      </div>
    );
  }
  if (history.error) {
    return (
      <div className="grid gap-3">
        {resultPageHeader}
        <p className="p-4 text-xs text-destructive">{history.error}</p>
      </div>
    );
  }
  const landscape = history.landscape;
  if (!landscape || landscape.results.length === 0) {
    return (
      <div className="grid gap-3">
        {resultPageHeader}
        <p className="p-4 text-xs text-muted-foreground">
          No stored result page for this search view yet. Use Check now in
          Rankings when you want to collect it.
        </p>
      </div>
    );
  }

  const ownDomain = target.target_domain?.replace(/^www\./, "") ?? null;

  return (
    <div className="grid gap-3">
      {resultPageHeader}
      <p className="text-[10px] text-muted-foreground">
        {trackingModeLabelForItem(target)} results for “{target.keyword}” as
        observed{" "}
        {landscape.observed_at ? formatDate(landscape.observed_at) : "recently"}{" "}
        on {target.device}.
      </p>
      <ol className="grid gap-1.5">
        {landscape.results.map((result) => {
          const isOwn =
            ownDomain !== null &&
            typeof result.domain === "string" &&
            result.domain.replace(/^www\./, "") === ownDomain;
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
