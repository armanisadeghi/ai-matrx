"use client";

/**
 * Canonical components for `seo_rank_reading` and `provider_run_receipt`.
 *
 * Each is THE one renderer for its kind (THE CANONICAL COMPONENT LAW):
 * dispatched standalone by the block registry AND composed by the family's
 * collection components for nested instances. serverData is the streaming
 * `{ value, isComplete }` bridge output or a bare kind value — both coerced by
 * the search family's `readSearchKindValue` (ONE reader, never a second copy);
 * every field read is defensive because values are partial mid-stream.
 */

import React from "react";
import {
  Clock,
  ExternalLink,
  Receipt,
  SearchX,
  ShieldQuestion,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCount } from "@/features/marketing/components/ranks/format";
import {
  num,
  readSearchKindValue,
  text,
} from "../search-kinds/search-kind-data";
import { SearchFavicon } from "../search-kinds/search-kind-shared";
import {
  MovementIndicator,
  RankBadge,
  RankChip,
  resultTypeLabel,
  shortDate,
} from "./rank-kind-shared";

interface RankKindBlockProps {
  serverData?: unknown;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// seo_rank_reading — one observation of where a tracked target stood
// ─────────────────────────────────────────────────────────────────────────────

export function SeoRankReadingBlock({
  serverData,
  className,
}: RankKindBlockProps) {
  const { value } = readSearchKindValue<"seo_rank_reading">(serverData);

  const observedAt = shortDate(value.observed_at);
  const organic = num(value.organic_rank);
  const absolute = num(value.absolute_rank);
  const url = text(value.matched_url);
  const domain = text(value.matched_domain);
  const title = text(value.title);
  const snippet = text(value.snippet);
  const matchRule = text(value.match_rule);
  // `found` is DERIVED on purpose: a NULL rank used to read identically to a
  // reading that was never taken, and that difference is the entire product.
  const found = value.found === true;

  return (
    <div
      className={cn(
        "my-2 rounded-lg border border-border bg-card p-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {found ? (
          <RankBadge rank={organic ?? absolute} caption="rank" emphasis />
        ) : (
          <div className="flex min-w-11 flex-col items-center justify-center rounded-md border border-dashed border-border px-2 py-1 text-muted-foreground">
            <SearchX className="h-4 w-4" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {found ? (title ?? domain ?? "Ranked") : "Not ranked"}
            </span>
            <RankChip>{resultTypeLabel(value.result_type)}</RankChip>
            <MovementIndicator movement={value.movement} />
          </div>

          {!found && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              The target was not present anywhere on this results page — an
              observation, not a missing check.
            </p>
          )}

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <SearchFavicon
                url={url}
                className="h-4 w-4 flex-shrink-0 rounded-sm"
              />
              <span className="truncate">{url}</span>
              <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
            </a>
          )}

          {snippet && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {snippet}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {observedAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {observedAt}
              </span>
            )}
            {absolute !== null && organic !== null && absolute !== organic && (
              <span>#{absolute} on the whole page</span>
            )}
            {/* WHY this counted as a match — auditability, never a mystery. */}
            {matchRule && (
              <span
                className="inline-flex items-center gap-1"
                title="Why this result counted as the tracked target"
              >
                <ShieldQuestion className="h-3 w-3" />
                matched by {matchRule.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// provider_run_receipt — what one paid provider call cost and produced
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🚨 `cost_usd = null` means UNMEASURED, never free. Rendering an absent cost
 * as "$0.00" is exactly the coalesce that let 112 live SerpAPI runs spend
 * nothing against every ceiling. The component says "not reported" and means
 * it.
 */
function costLabel(cost: number | null): {
  text: string;
  unmeasured: boolean;
} {
  if (cost === null) return { text: "not reported", unmeasured: true };
  if (cost === 0) return { text: "$0.00", unmeasured: false };
  return {
    text: cost < 0.01 ? `$${cost.toFixed(6)}` : `$${cost.toFixed(4)}`,
    unmeasured: false,
  };
}

export function ProviderRunReceiptBlock({
  serverData,
  className,
}: RankKindBlockProps) {
  const { value } = readSearchKindValue<"provider_run_receipt">(serverData);

  const provider = text(value.provider);
  const cost = costLabel(num(value.cost_usd));
  const latency = num(value.latency_seconds);
  const created = num(value.created_observations);
  const existing = num(value.existing_observations);
  const input = num(value.input_tokens);
  const output = num(value.output_tokens);
  const reasoning = num(value.reasoning_tokens);
  const cacheAge = num(value.cache_age_seconds);
  const fromCache = value.from_cache === true;
  const reusedRun = value.reused_completed_run === true;

  return (
    <div
      className={cn(
        "my-2 rounded-lg border border-border bg-card p-3 text-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Receipt className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-foreground">
          {provider ? `${provider} run` : "Provider run"}
        </span>
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
            cost.unmeasured
              ? "border border-dashed border-warning/60 text-warning"
              : "bg-muted text-foreground",
          )}
          title={
            cost.unmeasured
              ? "The provider reported no cost for this call. Unmeasured is not free — never fold it into a total as zero."
              : "Spend, as the provider reported it"
          }
        >
          {cost.text}
        </span>
        {fromCache && (
          <RankChip
            title={
              cacheAge !== null
                ? `Served from a stored payload ${formatCount(cacheAge)}s old`
                : "Served from a stored payload — no fresh paid call"
            }
          >
            from cache
          </RankChip>
        )}
        {reusedRun && <RankChip>reused completed run</RankChip>}
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Stat label="New observations" value={formatCount(created)} />
        <Stat label="Already had" value={formatCount(existing)} />
        <Stat
          label="Latency"
          value={latency === null ? "—" : `${latency.toFixed(2)}s`}
          icon={Timer}
        />
        {(input !== null || output !== null || reasoning !== null) && (
          <Stat
            label="Tokens (in/out/reason)"
            value={`${formatCount(input)} / ${formatCount(output)} / ${formatCount(reasoning)}`}
          />
        )}
      </dl>
    </div>
  );
}

const Stat: React.FC<{
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}> = ({ label, value, icon: Icon }) => (
  <div className="min-w-0">
    <dt className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
      {label}
    </dt>
    <dd className="flex items-center gap-1 truncate font-medium tabular-nums text-foreground">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
      {value}
    </dd>
  </div>
);
