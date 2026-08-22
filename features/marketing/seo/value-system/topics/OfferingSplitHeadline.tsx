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

import { BadgeDollarSign, CircleHelp, Landmark } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { formatCount } from "@/features/marketing/search-console/types";
import { rootTypeMeta, type OfferingSplitRow } from "./types";

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
    bar: "bg-success",
  },
  authority: {
    icon: Landmark,
    tone: "text-info",
    ring: "border-info/40 bg-info/5",
    bar: "bg-info",
  },
  unassigned: {
    icon: CircleHelp,
    tone: "text-warning",
    ring: "border-warning/40 bg-warning/5",
    bar: "bg-warning",
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
        "No primary topic, so the tree cannot say what this traffic is for. Placing it is the work.",
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
}: {
  rows: OfferingSplitRow[];
  windowLabel: string;
}) {
  const buckets = summarizeSplit(rows);
  const totalClicks = buckets.reduce((sum, bucket) => sum + bucket.clicks, 0);
  const totalImpressions = buckets.reduce(
    (sum, bucket) => sum + bucket.impressions,
    0,
  );
  const offering = buckets[0];
  const unplaced = buckets[2];

  return (
    <section className="shrink-0 rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">
          Where this site&apos;s search traffic leads
        </h2>
        <p className="text-[11px] text-muted-foreground">{windowLabel}</p>
      </div>

      <p className="px-3 pt-3 text-sm text-foreground">
        {totalClicks > 0 ? (
          <>
            <span className="font-semibold text-success">
              {pct(offering.clicks, totalClicks)}
            </span>{" "}
            of clicks trace up to something you sell.{" "}
            {unplaced.clicks > 0 ? (
              <>
                <span className="font-semibold text-warning">
                  {pct(unplaced.clicks, totalClicks)}
                </span>{" "}
                is not placed on the tree yet, so nobody can say what it is for.
              </>
            ) : null}
          </>
        ) : (
          <>No clicks in this window — the split below is impressions only.</>
        )}
      </p>

      <div className="grid gap-2 p-3 sm:grid-cols-3">
        {buckets.map((bucket) => {
          const chrome = BUCKET_CHROME[bucket.key];
          const Icon = chrome.icon;
          return (
            <div
              key={bucket.key}
              className={cn("rounded-md border p-2.5", chrome.ring)}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={cn("h-3.5 w-3.5", chrome.tone)} />
                <span className={cn("text-xs font-semibold", chrome.tone)}>
                  {bucket.label}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums text-foreground">
                  {formatCount(bucket.clicks)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  clicks · {pct(bucket.clicks, totalClicks)}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {formatCount(bucket.impressions)} impressions ·{" "}
                {pct(bucket.impressions, totalImpressions)} · {formatCount(bucket.keywords)}{" "}
                keywords
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded bg-muted">
                <div
                  className={cn("h-full", chrome.bar)}
                  style={{
                    width:
                      totalClicks > 0
                        ? `${(bucket.clicks / totalClicks) * 100}%`
                        : "0%",
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                {bucket.meaning}
              </p>
              {bucket.roots.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5">
                  {bucket.roots.map((entry) => (
                    <li
                      key={entry.root}
                      className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground"
                    >
                      <span className="truncate">
                        {rootTypeMeta(entry.root).label}
                      </span>
                      <span className="tabular-nums">
                        {formatCount(entry.clicks)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
