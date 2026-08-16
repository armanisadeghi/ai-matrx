"use client";

// features/crm/analytics/OrgOutreachReportPanel.tsx
//
// /crm/outreach-lists?view=report — "is outreach working for us at all?", one
// level above a single campaign (WP4 build step 6).
//
// THE DOOR LAW, again: every campaign row opens that campaign's own Performance
// view, and every headline number opens the list it counts. Nothing here is a
// number you can only stare at.
//
// The rollup is computed by the SAME pure functions as the per-campaign panel
// (`lib.ts`), so the org total and the campaign rows can never disagree — which
// is the failure a separately-written summary query always eventually produces.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Award, Megaphone, RefreshCw, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InlineQueryError,
  LoadingSurface,
  MetricCell,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";
import { formatRate } from "./lib";
import {
  fetchOrgOutreachReport,
  MAX_REPORTED_CAMPAIGNS,
  TREND_DAYS,
  type OrgOutreachReport,
} from "./service";

function CampaignRow({
  row,
}: {
  row: OrgOutreachReport["campaigns"][number];
}) {
  return (
    <Link
      href={`/crm/outreach-lists/${row.campaignId}?view=performance`}
      data-surface-value="report_campaign_row"
      className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-3 px-3 py-2 text-xs transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{row.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {row.status}
        </span>
      </span>
      <span className="w-16 text-right tabular-nums" title="Enrolled">
        {row.enrolled.toLocaleString()}
      </span>
      <span className="w-16 text-right tabular-nums" title="Contacted">
        {row.contacted.toLocaleString()}
      </span>
      <span
        className={cn(
          "w-20 text-right tabular-nums",
          row.engagementPct === null && "text-muted-foreground/70",
        )}
        title="Engaged, as a share of everyone contacted"
      >
        {formatRate(row.engagementPct)}
      </span>
      <span
        className={cn(
          "w-16 text-right font-semibold tabular-nums",
          row.wins > 0 ? "text-emerald-600 dark:text-emerald-400" : "",
        )}
        title="Confirmed wins"
      >
        {row.wins.toLocaleString()}
      </span>
    </Link>
  );
}

export function OrgOutreachReportPanel({
  organizationId,
}: {
  organizationId: string;
}) {
  const [data, setData] = useState<OrgOutreachReport | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetchOrgOutreachReport(organizationId));
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading && !data) return <LoadingSurface label="Rolling up your campaigns…" />;
  if (error && !data) {
    return (
      <InlineQueryError
        what="your outreach report"
        error={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) return null;

  const { totals } = data;
  const ranked = [...data.campaigns].sort((a, b) => b.wins - a.wins || b.contacted - a.contacted);

  return (
    <div className="flex flex-col gap-3" data-surface-value="org_outreach_report">
      <div className="grid grid-cols-2 rounded-xl border border-border bg-card sm:grid-cols-4">
        <MetricCell
          anchor="report_campaigns"
          label="Campaigns"
          value={totals.campaigns.toLocaleString()}
          detail={
            data.notShown > 0
              ? `${data.notShown.toLocaleString()} more not shown (top ${MAX_REPORTED_CAMPAIGNS})`
              : "all of them"
          }
          icon={<Megaphone className="h-3.5 w-3.5" />}
          href="/crm/outreach-lists"
        />
        <MetricCell
          anchor="report_contacted"
          label="People contacted"
          value={totals.contacted.toLocaleString()}
          detail={`of ${totals.enrolled.toLocaleString()} enrolled`}
          icon={<Send className="h-3.5 w-3.5" />}
          href="/crm/outreach-lists"
        />
        <MetricCell
          anchor="report_engagement"
          label="Engagement"
          value={formatRate(totals.engagementPct, "Not measured")}
          detail="replied, connected or booked"
          tone={totals.engagementPct === null ? "default" : "good"}
          icon={<Users className="h-3.5 w-3.5" />}
          href="/crm/inbox"
        />
        <MetricCell
          anchor="report_wins"
          label="Confirmed wins"
          value={totals.wins.toLocaleString()}
          detail={formatRate(totals.winPct, "no rate yet")}
          tone={totals.wins > 0 ? "good" : "default"}
          icon={<Award className="h-3.5 w-3.5" />}
        />
      </div>

      <p className="px-1 text-xs text-muted-foreground">{totals.headline}</p>

      <SectionCard
        title="Every campaign"
        anchor="report_campaign_table"
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
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-3 border-b border-border/60 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Campaign</span>
          <span className="w-16 text-right">Enrolled</span>
          <span className="w-16 text-right">Contacted</span>
          <span className="w-20 text-right">Engaged</span>
          <span className="w-16 text-right">Wins</span>
        </div>
        <div className="flex flex-col divide-y divide-border/60">
          {ranked.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No campaigns yet. Create one and this report fills itself in.
            </p>
          ) : (
            ranked.map((row) => <CampaignRow key={row.campaignId} row={row} />)
          )}
        </div>
        {data.notShown > 0 ? (
          <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            Showing the {MAX_REPORTED_CAMPAIGNS} most recent campaigns;{" "}
            {data.notShown.toLocaleString()} older one(s) are not counted in the
            totals above.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title={`Wins per week (last ${TREND_DAYS} days)`} anchor="report_trend">
        {data.trend.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            No wins credited yet across any campaign. Attribution runs nightly
            and credits a win the day our own crawl sees the link or the story
            appear — there is nothing to switch on.
          </p>
        ) : (
          <div className="flex items-end gap-1 px-3 py-3">
            {data.trend.map((point) => {
              const peak = Math.max(
                ...data.trend.map((p) => p.confirmed + p.proposed),
                1,
              );
              return (
                <span
                  key={point.bucket}
                  title={`Week of ${point.bucket}: ${point.confirmed} confirmed, ${point.proposed} awaiting a decision`}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <span className="flex w-full flex-col justify-end" style={{ height: 56 }}>
                    {point.proposed > 0 ? (
                      <span
                        className="w-full rounded-t bg-amber-400/60"
                        style={{ height: `${(point.proposed / peak) * 100}%` }}
                      />
                    ) : null}
                    {point.confirmed > 0 ? (
                      <span
                        className={cn(
                          "w-full bg-emerald-500/70",
                          point.proposed === 0 && "rounded-t",
                        )}
                        style={{ height: `${(point.confirmed / peak) * 100}%` }}
                      />
                    ) : null}
                  </span>
                  <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                    {point.bucket.slice(5)}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
