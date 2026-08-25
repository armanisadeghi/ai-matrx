"use client";

/**
 * THE PAYOFF READ — the number the whole tree exists to print.
 *
 * Arman: "if you have an SEO company and all they're doing is increasing this
 * type of traffic, they're not doing anything for you because you're never
 * gonna make more money from it." So this says, in one line, how much of the
 * site's search traffic traces up to something it actually sells.
 *
 * The third bucket is not decoration: traffic whose keyword has no primary
 * topic cannot be claimed as either. It is reported as what it is — not
 * placed yet — because folding it into "authority" would flatter the tree and
 * folding it into "offering" would flatter the agency.
 */

import {
  BadgeDollarSign,
  BrainCircuit,
  CircleHelp,
  Landmark,
  MousePointerClick,
  UserCheck,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { formatCount } from "@/features/marketing/search-console/types";
import type { OfferingSplitRow, TopicPlacementStatus } from "./types";

export type OfferingKpiTarget =
  | "offering"
  | "authority"
  | "unplaced"
  | "placed-clicks"
  | "placed-keywords"
  | "proposals";

interface Bucket {
  key: "offering" | "authority" | "unassigned";
  label: string;
  meaning: string;
  clicks: number;
  impressions: number;
  keywords: number;
  roots: Array<{ root: string; clicks: number; keywords: number }>;
}

const BUCKET_CHROME = {
  offering: {
    icon: BadgeDollarSign,
    tone: "text-success",
    ring: "border-success/40 bg-success/5",
  },
  authority: {
    icon: Landmark,
    tone: "text-info",
    ring: "border-info/40 bg-info/5",
  },
  unassigned: {
    icon: CircleHelp,
    tone: "text-warning",
    ring: "border-warning/40 bg-warning/5",
  },
} as const;

export function summarizeSplit(rows: OfferingSplitRow[]): Bucket[] {
  const base: Bucket[] = [
    {
      key: "offering",
      label: "Can become money",
      meaning:
        "These searches trace up to a service, product, problem, audience or brand you actually sell.",
      clicks: 0,
      impressions: 0,
      keywords: 0,
      roots: [],
    },
    {
      key: "authority",
      label: "Authority only",
      meaning:
        "Real traffic that builds standing and can never become a sale. Growth here is not revenue growth.",
      clicks: 0,
      impressions: 0,
      keywords: 0,
      roots: [],
    },
    {
      key: "unassigned",
      label: "Not placed yet",
      meaning:
        "No primary offering, so the tree cannot say what this traffic is for. Placing it is the work.",
      clicks: 0,
      impressions: 0,
      keywords: 0,
      roots: [],
    },
  ];
  const byKey = new Map(base.map((bucket) => [bucket.key, bucket]));
  for (const row of rows) {
    const bucket = byKey.get(row.bucket);
    if (!bucket) continue;
    const clicks = Number(row.clicks ?? 0);
    const keywords = Number(row.keywords ?? 0);
    bucket.clicks += clicks;
    bucket.impressions += Number(row.impressions ?? 0);
    bucket.keywords += keywords;
    if (row.root_type && row.root_type !== "none") {
      bucket.roots.push({ root: row.root_type, clicks, keywords });
    }
  }
  for (const bucket of base) bucket.roots.sort((a, b) => b.clicks - a.clicks);
  return base;
}

function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

export function OfferingSplitHeadline({
  rows,
  windowLabel,
  placement,
  activeTarget,
  onSelect,
}: {
  rows: OfferingSplitRow[];
  windowLabel: string;
  placement?: TopicPlacementStatus;
  activeTarget: OfferingKpiTarget | null;
  onSelect: (target: OfferingKpiTarget) => void;
}) {
  const buckets = summarizeSplit(rows);
  const totalClicks = buckets.reduce((sum, bucket) => sum + bucket.clicks, 0);
  const offering = buckets[0];
  const unplaced = buckets[2];
  const clicksPlaced = placement
    ? pct(placement.demand_clicks_placed, placement.demand_clicks)
    : "—";
  const keywordsPlaced = placement
    ? pct(placement.demand_keywords_placed, placement.demand_keywords)
    : "—";
  const owed = placement
    ? Math.max(placement.queue_pending - placement.queue_deferred, 0)
    : 0;

  const placementCards = placement
    ? [
        {
          key: "placed-clicks" as const,
          label: "Search clicks placed",
          value: clicksPlaced,
          detail: `${formatCount(placement.demand_clicks_placed)} of ${formatCount(placement.demand_clicks)} clicks`,
          icon: MousePointerClick,
          title:
            "Filter the offering tree to branches with placed search clicks",
        },
        {
          key: "placed-keywords" as const,
          label: "Keywords with demand",
          value: keywordsPlaced,
          detail: `${formatCount(placement.demand_keywords_placed)} of ${formatCount(placement.demand_keywords)} placed`,
          icon: BrainCircuit,
          title: "Filter the offering tree to branches with placed keywords",
        },
        ...(owed > 0
          ? [
              {
                key: "unplaced" as const,
                label: "Needs placement",
                value: formatCount(owed),
                detail: "Open the unplaced keyword table",
                icon: CircleHelp,
                title: "Show keywords that still need an offering",
              },
            ]
          : []),
        ...(placement.proposals_pending > 0
          ? [
              {
                key: "proposals" as const,
                label: "Needs confirmation",
                value: formatCount(placement.proposals_pending),
                detail: "Open the confirmation table",
                icon: UserCheck,
                title: "Show placements awaiting your confirmation",
              },
            ]
          : []),
      ]
    : [];

  return (
    <section className="shrink-0 rounded-lg border border-border bg-card p-2">
      <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-center">
        <div className="min-w-56 px-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Where search traffic leads
            </h2>
            <span className="text-[10px] text-muted-foreground 2xl:hidden">
              {windowLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {totalClicks > 0 ? (
              <>
                <span className="font-semibold text-success">
                  {pct(offering.clicks, totalClicks)}
                </span>{" "}
                reaches something you sell
                {unplaced.clicks > 0
                  ? ` · ${pct(unplaced.clicks, totalClicks)} still unplaced`
                  : ""}
              </>
            ) : (
              <>No clicks in this window; showing impressions.</>
            )}
          </p>
          <p className="hidden text-[10px] text-muted-foreground 2xl:block">
            {windowLabel}
          </p>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-1.5 lg:grid-cols-3 xl:grid-cols-7">
          {buckets.map((bucket) => {
            const chrome = BUCKET_CHROME[bucket.key];
            const Icon = chrome.icon;
            const target =
              bucket.key === "offering"
                ? "offering"
                : bucket.key === "authority"
                  ? "authority"
                  : "unplaced";
            return (
              <button
                type="button"
                key={bucket.key}
                onClick={() => onSelect(target)}
                aria-pressed={activeTarget === target}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  chrome.ring,
                  activeTarget === target && "ring-2 ring-ring",
                )}
                title={`${bucket.meaning} Click to show it.`}
              >
                <Icon className={cn("h-4 w-4 shrink-0", chrome.tone)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-xs font-semibold",
                        chrome.tone,
                      )}
                    >
                      {bucket.label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatCount(bucket.clicks)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>{pct(bucket.clicks, totalClicks)} of clicks</span>
                    <span className="tabular-nums">
                      {formatCount(bucket.keywords)} keywords
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
          {placementCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                type="button"
                key={card.key}
                onClick={() => onSelect(card.key)}
                aria-pressed={activeTarget === card.key}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  activeTarget === card.key && "ring-2 ring-ring",
                )}
                title={card.title}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-foreground">
                      {card.label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {card.value}
                    </span>
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {card.detail}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
