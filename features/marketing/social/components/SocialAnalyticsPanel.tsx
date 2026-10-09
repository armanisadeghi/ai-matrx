"use client";

/**
 * The Social panel on the brand Analytics page, beside `BrandChannelPanel`:
 * headline numbers from the same brand roll-up the KPIs tab reads, and one
 * link into KPIs. Numbers are from stored snapshots and post stats; an
 * unmeasured one renders "—", never 0.
 */

import { useState } from "react";

import { InlineQueryError, LoadingSurface, SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { KpiTile } from "@/components/official/kpi/KpiTile";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { useBrandSocialData, useKpiGoals } from "../hooks";
import { goalMetricId, goalProgress, measureGoal } from "../kpi";
import { formatGrowth, judgeFollowerGrowth } from "../mappers";
import { formatCompact, OUTLIER_TIER_THRESHOLDS } from "../outlier";

const DAY_MS = 86_400_000;

export function SocialAnalyticsPanel({
  brandId,
  organizationId,
  brandSeg,
}: {
  brandId: string;
  organizationId: string;
  brandSeg: string;
}) {
  const data = useBrandSocialData(organizationId, brandId);
  const goals = useKpiGoals(organizationId, brandId);
  const [now] = useState(() => Date.now());
  const kpisHref = `${marketingRoutes.brandSocials(brandSeg)}/kpis`;

  if (data.isLoading || goals.isLoading) return <LoadingSurface label="Loading social numbers…" />;
  if (data.isError || goals.isError) {
    return <InlineQueryError what="social numbers" error={data.error ?? goals.error} onRetry={() => { void data.refetch(); void goals.refetch(); }} />;
  }

  const accounts = data.data?.accounts ?? [];
  const posts = data.data?.posts ?? [];
  const snapshots = data.data?.snapshots ?? [];
  const own = accounts.filter((a) => a.role === "own");
  const ownFollowers = own.map((a) => a.followers).filter((v): v is number => v !== null);
  const recentOutliers = posts.filter(
    (p) =>
      (p.outlierScore ?? 0) >= OUTLIER_TIER_THRESHOLDS.neutral &&
      p.postedAt !== null &&
      now - Date.parse(p.postedAt) <= 30 * DAY_MS,
  ).length;
  const anyScored = posts.some((p) => p.outlierScore !== null);

  // Own followers' 30-day change: only when exactly one own account carries it
  // (summing unlike snapshot histories would invent a comparison).
  const growth =
    own.length === 1
      ? judgeFollowerGrowth(snapshots.filter((s) => s.profile_id === own[0]!.profileId), 30)
      : null;

  const kpiAccounts = accounts
    .filter((a) => a.trackedAccountId)
    .map((a) => ({ trackedAccountId: a.trackedAccountId!, platform: a.platform, role: a.role, followers: a.followers }));
  const goalRows = goals.data ?? [];
  const statuses = goalRows.map((g) => {
    const metric = goalMetricId(g);
    if (!metric) return null;
    return goalProgress({ goal: g, metric, current: measureGoal({ goal: g, metric, accounts: kpiAccounts, posts, now }).value, now }).status;
  });
  const onTrack = statuses.filter((s) => s === "achieved" || s === "on_track").length;

  return (
    <SectionCard title="Social" action={{ label: "KPIs", href: kpisHref }}>
      <div className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-4">
        <KpiTile
          label="Tracked accounts"
          value={accounts.filter((a) => a.trackedAccountId).length}
          hint={`${own.length} own`}
          href={`${marketingRoutes.brandSocials(brandSeg)}/accounts`}
        />
        <KpiTile
          label="Own followers"
          value={ownFollowers.length === 0 ? null : formatCompact(ownFollowers.reduce((s, v) => s + v, 0))}
          hint={growth ? `${formatGrowth(growth.fraction)} · ${growth.note}` : own.length > 1 ? `${own.length} accounts` : undefined}
          title="Newest follower count of each own account, added up."
        />
        <KpiTile
          label="Outliers, 30 days"
          value={anyScored ? recentOutliers : null}
          hint="2x and up"
          href={`${marketingRoutes.brandSocials(brandSeg)}/outliers`}
          title="Posts from tracked accounts at 2x or more of their creator's median views."
        />
        <KpiTile
          label="Goals on track"
          value={goalRows.length === 0 ? null : `${onTrack} of ${goalRows.length}`}
          hint={goalRows.length === 0 ? "No goals" : undefined}
          href={kpisHref}
        />
      </div>
    </SectionCard>
  );
}
