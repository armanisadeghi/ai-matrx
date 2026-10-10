"use client";

/**
 * Private insights on the account page: the connected account's own analytics for the last 30 days,
 * from the shared insights reader (the KPI "Own channel" table reads the same one). The four headline
 * figures always show; any other figure the provider sent joins them. NULL is "Not available".
 */

import { KpiTile } from "@/components/official/kpi/KpiTile";

import { INSIGHT_METRICS } from "../insights";
import { formatCompact } from "../outlier";
import { useOwnInsights } from "../useOwnInsights";
import { TopOwnPosts } from "./TopOwnPosts";

const HEADLINE = new Set(["followers", "impressions", "reach", "engagements"]);

export function AccountInsights({ trackedAccountId }: { trackedAccountId: string }) {
  const insights = useOwnInsights([trackedAccountId]);
  const summary = insights.summaries.get(trackedAccountId);
  if (!summary) return null;
  const shown = INSIGHT_METRICS.filter((m) => HEADLINE.has(m.id) || summary.values[m.id] !== null);
  return (
    <div className="flex flex-col gap-4">
    <section aria-label="Private insights" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-foreground">Private insights</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {shown.map((m) => {
          const v = summary.values[m.id];
          return (
            <KpiTile
              key={m.id}
              label={m.label}
              value={v === null ? null : formatCompact(v)}
              hint={insights.isError ? "Couldn't load" : v === null ? "Not available" : m.kind === "flow" ? "Last 30 days" : undefined}
              loading={insights.isLoading}
              title={summary.latestDate ? `Through ${summary.latestDate}` : undefined}
            />
          );
        })}
      </div>
    </section>
    <TopOwnPosts trackedAccountId={trackedAccountId} />
    </div>
  );
}
