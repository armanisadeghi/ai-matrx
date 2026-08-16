"use client";

// features/crm/analytics/CampaignPerformancePanel.tsx
//
// /crm/outreach-lists/[listId]?view=performance — "is this campaign working?",
// answered for a non-technical expert (WP4 build step 6).
//
// THE DOOR LAW. Every number here opens to the rows behind it: a funnel stage
// filters the member table, the reply rate opens the campaign's inbox thread
// list, a win opens the Outcomes view with its evidence drawer. There is no
// number on this panel you can only look at.
//
// 🚨 EVERY RATE CAN SAY "NOT MEASURED". A campaign that has sent nothing shows
// "—", never "0%". The pure core (`lib.ts`) returns null for an empty
// denominator, and this component is careful never to coalesce that to a zero
// on the way to the screen.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Award,
  Inbox,
  MailCheck,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InlineQueryError,
  LoadingSurface,
  MetricCell,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";
import { formatRate, type FunnelStage } from "./lib";
import {
  fetchCampaignPerformance,
  TREND_DAYS,
  type CampaignPerformance,
} from "./service";

/** Which member statuses a funnel stage means — the stage IS a filter. */
const STAGE_FILTER: Record<string, string | null> = {
  enrolled: null,
  contacted: "sent",
  engaged: "replied",
  won: null,
};

function stageHref(campaignId: string, stage: FunnelStage): string {
  if (stage.key === "won") {
    return `/crm/outreach-lists/${campaignId}?view=outcomes`;
  }
  const filter = STAGE_FILTER[stage.key];
  return filter
    ? `/crm/outreach-lists/${campaignId}?status=${filter}`
    : `/crm/outreach-lists/${campaignId}`;
}

function FunnelRow({
  campaignId,
  stage,
  widestCount,
}: {
  campaignId: string;
  stage: FunnelStage;
  widestCount: number;
}) {
  // The bar is proportional to the WIDEST stage, not to 100 — a funnel where
  // everything is tiny next to an invisible maximum tells you nothing.
  const width = widestCount > 0 ? (stage.count / widestCount) * 100 : 0;
  return (
    <Link
      href={stageHref(campaignId, stage)}
      data-surface-value={`funnel_${stage.key}`}
      className="group block rounded-lg px-3 py-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium">{stage.label}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {stage.count.toLocaleString()}
          </span>
          <span
            className={cn(
              "text-[11px] tabular-nums",
              stage.conversionPct === null
                ? "text-muted-foreground/70"
                : "text-muted-foreground",
            )}
          >
            {stage.conversionPct === null
              ? "not measured"
              : `${formatRate(stage.conversionPct)} of previous`}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary/70 transition-all group-hover:bg-primary"
          style={{ width: `${Math.max(width, stage.count > 0 ? 2 : 0)}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {stage.verdict}
      </p>
    </Link>
  );
}

function WinTrend({ data }: { data: CampaignPerformance }) {
  if (data.trend.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        No wins recorded in the last {TREND_DAYS} days. That is not the same as
        zero results — attribution credits a win the day our own crawl sees the
        link or the story appear.
      </p>
    );
  }
  const peak = Math.max(
    ...data.trend.map((point) => point.confirmed + point.proposed),
    1,
  );
  return (
    <div className="flex items-end gap-1 px-3 py-3" role="img" aria-label="Wins per week">
      {data.trend.map((point) => {
        const total = point.confirmed + point.proposed;
        return (
          <Link
            key={point.bucket}
            href={`/crm/outreach-lists/${data.campaignId}?view=outcomes`}
            title={`Week of ${point.bucket}: ${point.confirmed} confirmed, ${point.proposed} awaiting a decision`}
            className="group flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <span className="flex w-full flex-col justify-end" style={{ height: 64 }}>
              {point.proposed > 0 ? (
                <span
                  className="w-full rounded-t bg-amber-400/60 group-hover:bg-amber-400"
                  style={{ height: `${(point.proposed / peak) * 100}%` }}
                />
              ) : null}
              {point.confirmed > 0 ? (
                <span
                  className={cn(
                    "w-full bg-emerald-500/70 group-hover:bg-emerald-500",
                    point.proposed === 0 && "rounded-t",
                  )}
                  style={{ height: `${(point.confirmed / peak) * 100}%` }}
                />
              ) : null}
            </span>
            <span className="w-full truncate text-center text-[10px] text-muted-foreground">
              {point.bucket.slice(5)}
            </span>
            <span className="sr-only">{total} win(s)</span>
          </Link>
        );
      })}
    </div>
  );
}

export function CampaignPerformancePanel({
  campaignId,
}: {
  campaignId: string;
}) {
  const [data, setData] = useState<CampaignPerformance | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetchCampaignPerformance(campaignId));
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading && !data) return <LoadingSurface label="Measuring this campaign…" />;
  if (error && !data) {
    return (
      <InlineQueryError
        what="this campaign's performance"
        error={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) return null;

  const widest = Math.max(...data.funnel.map((stage) => stage.count), 1);

  return (
    <div className="flex flex-col gap-3" data-surface-value="campaign_performance">
      <div className="grid grid-cols-2 rounded-xl border border-border bg-card sm:grid-cols-4">
        <MetricCell
          anchor="perf_enrolled"
          label="Enrolled"
          value={data.funnel[0].count.toLocaleString()}
          detail="everyone in this campaign"
          icon={<Users className="h-3.5 w-3.5" />}
          href={`/crm/outreach-lists/${campaignId}`}
        />
        <MetricCell
          anchor="perf_reply_rate"
          label="Reply rate"
          value={formatRate(data.responses.replyRate, "Not measured")}
          detail={data.responses.verdict}
          tone={data.responses.replyRate === null ? "default" : "good"}
          icon={<Inbox className="h-3.5 w-3.5" />}
          href={`/crm/outreach-lists/${campaignId}?status=replied`}
        />
        <MetricCell
          anchor="perf_confirmed_wins"
          label="Confirmed wins"
          value={data.confirmedWins.toLocaleString()}
          detail="proved by our own crawl"
          tone={data.confirmedWins > 0 ? "good" : "default"}
          icon={<Award className="h-3.5 w-3.5" />}
          href={`/crm/outreach-lists/${campaignId}?view=outcomes`}
        />
        <MetricCell
          anchor="perf_awaiting_decision"
          label="Awaiting your call"
          value={data.proposedWins.toLocaleString()}
          detail="credited, not yet confirmed by a human"
          tone={data.proposedWins > 0 ? "warning" : "default"}
          icon={<MailCheck className="h-3.5 w-3.5" />}
          href={`/crm/outreach-lists/${campaignId}?view=outcomes`}
        />
      </div>

      <SectionCard
        title="Opportunity flow"
        anchor="performance_funnel"
        headerExtra={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void load()}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
        }
      >
        <div className="flex flex-col divide-y divide-border/60">
          {data.funnel.map((stage) => (
            <FunnelRow
              key={stage.key}
              campaignId={campaignId}
              stage={stage}
              widestCount={widest}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title={`Wins per week (last ${TREND_DAYS} days)`} anchor="performance_trend">
        <WinTrend data={data} />
        {data.trend.length > 0 ? (
          <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500/70 align-middle" />
            confirmed
            <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400/60 align-middle" />
            awaiting a decision. Rejected credits are excluded — a person said
            they were not ours.
            {data.trendTruncated
              ? " This window hit its row limit, so older weeks may be incomplete."
              : ""}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Where people left" anchor="performance_exits">
        <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {data.exits.map((exit) => (
            <Link
              key={exit.status}
              href={`/crm/outreach-lists/${campaignId}?status=${exit.status}`}
              data-surface-value={`exit_${exit.status}`}
              className="block px-3 py-2 transition-colors hover:bg-muted/60"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">{exit.label}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {exit.count.toLocaleString()}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {exit.verdict}
              </p>
            </Link>
          ))}
        </div>
      </SectionCard>

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <TrendingUp className="h-3 w-3 shrink-0" />
        Opens and clicks are deliberately not reported: about half of all opens
        are machine noise, so a decision made on them is a decision made on a
        number we know is wrong.
      </p>
    </div>
  );
}
