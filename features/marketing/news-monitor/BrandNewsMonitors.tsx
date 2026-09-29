"use client";

/**
 * The brand's news monitors on its Monitoring front door — each one opens its
 * run view (the latest report, digest and watch list). The editor is the
 * "News monitor" door above; this list is how a person gets back to what a
 * monitor found.
 */

import { useState } from "react";
import Link from "next/link";
import { Radar } from "lucide-react";

import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useBrandTrackers } from "@/features/marketing/monitor-setup/data";

import { Pill, formatWhen } from "./kinds/shared";
import { isRecord, num, str } from "./run-document";

const SHOWN_BY_DEFAULT = 6;

export function BrandNewsMonitors({ brandId, brandSeg }: { brandId: string; brandSeg: string }) {
  const trackers = useBrandTrackers(brandId);
  const [showAll, setShowAll] = useState(false);
  if (trackers.isError) {
    return <InlineQueryError
        what="this brand's news monitors"
        error={trackers.error}
        onRetry={() => void trackers.refetch()}
      />;
  }
  const rows = trackers.data ?? [];
  if (trackers.isPending || rows.length === 0) return null;
  // Most recently changed first (the read orders by updated_at); a long list folds.
  const shown = showAll ? rows : rows.slice(0, SHOWN_BY_DEFAULT);
  return (
    <section className="rounded-md border border-border bg-card p-3" data-surface-value="brand_news_monitors">
      <h2 className="text-sm font-semibold text-foreground">This brand&apos;s news monitors</h2>
      <p className="text-xs text-muted-foreground">
        Open one to read its latest run: the report, what surfaced, the watch list with every
        reason, and what was set aside.
      </p>
      <ul className="mt-2 flex flex-col divide-y divide-border">
        {shown.map((t) => {
          const summary = isRecord(t.last_run_summary) ? t.last_run_summary : null;
          const counts = summary && isRecord(summary.counts) ? summary.counts : null;
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-sm">
              <Radar className="h-3.5 w-3.5 text-muted-foreground" />
              <Link
                href={marketingRoutes.brandMonitorRun(brandSeg, t.id)}
                className="font-medium text-primary hover:underline"
              >
                {t.name}
              </Link>
              {(t.lenses ?? []).map((lens) => (
                <Pill key={lens}>{lens === "opportunity" ? "news we can join" : "who writes about us"}</Pill>
              ))}
              {!t.is_active ? <Pill tone="warn">paused</Pill> : null}
              {t.auto_run_paused_at ? <Pill tone="bad">scheduled runs paused at the spending limit</Pill> : null}
              <span className="text-xs text-muted-foreground">
                {summary
                  ? `last run ${formatWhen(str(summary.generated_at) || t.last_run_at)}${counts ? ` · ${num(counts.surfaced)} surfaced · ${num(counts.collected)} read` : ""}`
                  : "not run yet"}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length > shown.length ? (
        <button type="button" className="mt-1 text-xs text-primary" onClick={() => setShowAll(true)}>
          Show all {rows.length} monitors
        </button>
      ) : null}
    </section>
  );
}
