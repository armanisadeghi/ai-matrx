"use client";

/**
 * Canonical components for `seo_rank_target`, `seo_rank_portfolio` and
 * `seo_rank_target_removal` (Rank Kinds Run, Stage B).
 *
 * INVENTORY LAW: the user-facing tracking-mode label is NOT re-derived here.
 * `trackingModeLabelForItem` in `features/marketing/components/ranks/types.ts`
 * is the platform's one rule for turning provider + engine + search_type +
 * location into something a human should read ("Google — Map pack", never
 * "serpapi/local_pack"), and it is consumed verbatim. Its signature was
 * widened to a structural bag of optional strings so a PARTIAL mid-stream kind
 * value fits — widened, never forked.
 *
 * The portfolio delegates every row to `seo_rank_target`'s own component via
 * `RankKindNested` (db overrides included) — it owns only the collection
 * chrome.
 */

import React from "react";
import { CheckCircle2, Globe, MapPin, Repeat, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCount } from "@/features/marketing/components/ranks/format";
import { trackingModeLabelForItem } from "@/features/marketing/components/ranks/types";
import {
  items,
  num,
  readSearchKindValue,
  strings,
  text,
} from "../search-kinds/search-kind-data";
import { SectionHeading } from "../search-kinds/search-kind-shared";
import { RankKindNested } from "./RankKindNested";
import {
  MovementIndicator,
  RankBadge,
  RankChip,
  shortDate,
} from "./rank-kind-shared";

interface RankKindBlockProps {
  serverData?: unknown;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// seo_rank_target — identity plus standing
// ─────────────────────────────────────────────────────────────────────────────

export function SeoRankTargetBlock({
  serverData,
  className,
}: RankKindBlockProps) {
  const { value } = readSearchKindValue<"seo_rank_target">(serverData);

  const keyword = text(value.keyword);
  if (!keyword) return null;

  const mode = trackingModeLabelForItem({
    provider: value.provider,
    engine: value.engine,
    search_type: value.search_type,
    location_name: value.location_name,
  });
  const location = text(value.location_name);
  const domain = text(value.target_domain);
  const model = text(value.model_name);
  const group = text(value.group);
  const tags = strings(value.tags);
  const cadence = num(value.cadence_days);
  const checks = num(value.checks_count);
  const best = num(value.best_position);
  const lastChecked = shortDate(value.last_checked_at);
  const isActive = value.is_active !== false;

  return (
    <div
      className={cn(
        "my-2 rounded-lg border border-border bg-card p-3",
        !isActive && "opacity-70",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <RankBadge
          rank={value.latest_position}
          caption="now"
          emphasis={typeof value.latest_position === "number"}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {keyword}
            </span>
            <MovementIndicator movement={value.movement} />
            {!isActive && <RankChip>paused</RankChip>}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {mode}
              {model ? ` · ${model}` : ""}
            </span>
            {location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {location}
              </span>
            )}
            {cadence !== null && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="h-3 w-3" />
                every {cadence}d
              </span>
            )}
            {domain && <span className="truncate">tracking {domain}</span>}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {best !== null && (
              <span>
                best <span className="font-medium text-foreground">#{best}</span>
              </span>
            )}
            {typeof value.previous_position === "number" && (
              <span>previous #{value.previous_position}</span>
            )}
            {typeof value.latest_absolute_position === "number" && (
              <span>#{value.latest_absolute_position} on the page</span>
            )}
            {checks !== null && <span>{formatCount(checks)} readings</span>}
            {lastChecked && <span>last checked {lastChecked}</span>}
            {value.include_subdomains === true && <span>subdomains count</span>}
          </div>

          {(group || tags.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {group && <RankChip>{group}</RankChip>}
              {tags.map((tag) => (
                <RankChip key={tag}>{tag}</RankChip>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// seo_rank_portfolio — everything one site tracks
// ─────────────────────────────────────────────────────────────────────────────

export function SeoRankPortfolioBlock({
  serverData,
  className,
}: RankKindBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"seo_rank_portfolio">(serverData);

  const targets = items(value.targets);
  const active = num(value.active_count);
  const improved = num(value.improved_count);
  const declined = num(value.declined_count);

  return (
    <div className={cn("my-2 space-y-2", className)}>
      <SectionHeading
        icon={Globe}
        label="Tracked rankings"
        count={targets.length}
      />

      {(active !== null || improved !== null || declined !== null) && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {active !== null && <RankChip>{formatCount(active)} active</RankChip>}
          {improved !== null && (
            <RankChip className="border-success/40 text-success">
              {formatCount(improved)} improved
            </RankChip>
          )}
          {declined !== null && (
            <RankChip className="border-destructive/40 text-destructive">
              {formatCount(declined)} declined
            </RankChip>
          )}
        </div>
      )}

      {targets.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {isComplete
            ? "No keywords tracked yet."
            : "Loading tracked rankings…"}
        </p>
      ) : (
        <div className="space-y-2">
          {targets.map((target, i) => (
            <RankKindNested key={i} value={target} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// seo_rank_target_removal — a boolean receipt for a boolean outcome
// ─────────────────────────────────────────────────────────────────────────────

export function SeoRankTargetRemovalBlock({
  serverData,
  className,
}: RankKindBlockProps) {
  const { value } = readSearchKindValue<"seo_rank_target_removal">(serverData);
  const removed = value.removed === true;
  const targetId = text(value.target_id);

  return (
    <div
      className={cn(
        "my-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm",
        className,
      )}
    >
      {removed ? (
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-foreground">
        {removed
          ? "Tracked ranking removed."
          : "Nothing was removed — the target was already gone."}
      </span>
      {targetId && (
        <code className="truncate text-[11px] text-muted-foreground">
          {targetId}
        </code>
      )}
    </div>
  );
}
