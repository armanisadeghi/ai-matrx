"use client";

/**
 * Rank-collection receipt body for the `seo` tool (action=collect_rank).
 *
 * The tool returns a RECEIPT, not ranks — what the run persisted and whether
 * it was served from cache. So this renders the run's identity from the call's
 * OWN arguments (keyword, provider, target domain, market) plus the persisted
 * counts. `run_id` / `raw_payload_id` are internal ids and stay in Tool Admin.
 */

import { Database, MapPin, Monitor, Smartphone, Timer } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatCacheAge,
  type SeoCollectionReceipt,
} from "@/features/seo/rank/types";

export interface RankRunArgs {
  keyword?: string;
  provider?: string;
  targetDomain?: string;
  country?: string;
  language?: string;
  device?: string;
  location?: string;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "muted" | "strong";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-sm tabular-nums",
          tone === "muted" ? "text-muted-foreground" : "font-semibold text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function RankReceiptBody({
  receipt,
  args,
}: {
  receipt: SeoCollectionReceipt;
  args: RankRunArgs;
}) {
  const market = [args.location, args.country, args.language]
    .filter(Boolean)
    .join(" · ");
  const DeviceIcon = args.device === "mobile" ? Smartphone : Monitor;
  const cacheAge = formatCacheAge(receipt.cache_age_seconds);
  const freshness =
    receipt.freshness_ttl_seconds && receipt.freshness_ttl_seconds > 0
      ? `${Math.round(receipt.freshness_ttl_seconds / 60)}m TTL`
      : null;

  return (
    <div className="divide-y divide-border/60">
      {args.keyword && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
          <span className="text-sm font-medium text-foreground">
            &ldquo;{args.keyword}&rdquo;
          </span>
          {args.targetDomain && (
            <span className="text-sm text-muted-foreground">
              → {args.targetDomain}
            </span>
          )}
          {args.provider && (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {args.provider}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 px-4 py-3">
        <Stat
          label="New observations"
          value={receipt.created_observations.toLocaleString()}
        />
        <Stat
          label="Already recorded"
          value={receipt.existing_observations.toLocaleString()}
          tone="muted"
        />
        <Stat
          label="Source"
          value={
            receipt.from_cache
              ? `Cache${cacheAge ? ` · ${cacheAge}` : ""}`
              : receipt.reused_completed_run
                ? "Reused run"
                : "Live fetch"
          }
          tone="muted"
        />
      </div>

      {(market || args.device || freshness || receipt.raw_payload_id) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 text-xs text-muted-foreground">
          {args.device && (
            <span className="flex items-center gap-1.5">
              <DeviceIcon className="size-3.5" />
              {args.device}
            </span>
          )}
          {market && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {market}
            </span>
          )}
          {freshness && (
            <span className="flex items-center gap-1.5">
              <Timer className="size-3.5" />
              {freshness}
            </span>
          )}
          {receipt.raw_payload_id && (
            <span className="flex items-center gap-1.5">
              <Database className="size-3.5" />
              Raw payload stored
            </span>
          )}
        </div>
      )}
    </div>
  );
}
