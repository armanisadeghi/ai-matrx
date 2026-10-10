"use client";

/**
 * KPIs (UI-SPEC §8): the brand's goals with current-vs-target computed from
 * stored snapshots and post stats (`kpi.ts` holds every rule), a follower
 * trend per own account, a benchmark of own accounts against tracked
 * competitors, and the owned YouTube channel's private numbers where they
 * exist. Other platforms' private stats wait on platform approvals and say so.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { Pause, Pencil, Play, Plus, Target, Trash2, UserPlus, Users } from "lucide-react";

import {
  Badge,
  Button,
  EmptyState,
  Field,
  RegionSkeleton,
  SegmentedControl,
  Select,
  type SelectOption,
} from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { useRouter } from "next/navigation";
import { socialRowOpen } from "../row-open";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import {
  useSurfaceClientTools,
  useSurfaceRuntimeRegistration,
  useSurfaceWriteHandlers,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import {
  SOCIAL_KPIS_SURFACE_NAME,
  SOCIAL_KPIS_TOOLS,
  createSocialKpisScope,
} from "@/features/surfaces/manifests/marketing-social-tabs.manifest";
import { cn } from "@/lib/utils";
import { BrandChannelPanel } from "@/features/marketing/youtube/components/BrandChannelPanel";

import { useAccountRows, useBrandSocialData, useInvalidateSocial, useKpiGoals } from "../hooks";
import {
  KPI_METRICS,
  KPI_PERIODS,
  KPI_STATUS_LABELS,
  benchmarkActivity,
  formatKpiValue,
  goalMetricId,
  goalProgress,
  measureGoal,
  metricDefOf,
  sortBenchmark,
  type BenchmarkRow,
  type KpiAccount,
  type KpiMetricId,
  type KpiStatus,
} from "../kpi";
import { accountLabels, accountName, formatGrowth, judgeFollowerGrowth, profileFollowerSeries } from "../mappers";
import { formatCompact } from "../outlier";
import { socialErrorMessage } from "../server";
import { archiveKpiGoal, updateKpiGoalStatus } from "../service";
import { goalScopeOf, saveKpiGoal } from "../social-actions";
import { parseCreateGoals, parseDeleteIds, parseUpdateGoals, type GoalRef } from "../agent-writes";
import {
  SOCIAL_PLATFORM_LABELS,
  TRACKED_ROLE_LABELS,
  isSocialPlatform,
  type AccountRow,
  type BrandPost,
  type KpiGoalRow,
} from "../types";
import { MetricChart } from "./MetricChart";
import { PlatformMark } from "./PlatformMark";
import { useSocials } from "./SocialsContext";
import { brandAccountHref } from "../property-account-href";
import { useTrackOwn } from "./useTrackOwn";
import { OwnInsightsTable } from "./OwnInsightsTable";
import { ownTrackingState } from "../own-accounts";

type KpiView = "trend" | "benchmark" | "own";

const VIEW_OPTIONS = [
  { value: "trend", label: "Trend" },
  { value: "benchmark", label: "Benchmark" },
  { value: "own", label: "Own channel" },
] as const;

const STATUS_TONE: Record<KpiStatus, "success" | "warning" | "neutral"> = {
  achieved: "success",
  on_track: "success",
  behind: "warning",
  no_history: "neutral",
  no_data: "neutral",
  paused: "neutral",
};

function platformLabel(p: string): string {
  return isSocialPlatform(p) ? SOCIAL_PLATFORM_LABELS[p] : p;
}

function toKpiAccounts(accounts: readonly AccountRow[]): KpiAccount[] {
  return accounts
    .filter((a): a is AccountRow & { trackedAccountId: string } => a.trackedAccountId !== null)
    .map((a) => ({
      trackedAccountId: a.trackedAccountId,
      platform: a.platform,
      role: a.role,
      followers: a.followers,
    }));
}

export function KpisTab() {
  const { brandId, organizationId, openTrack, canEdit } = useSocials();
  const data = useBrandSocialData(organizationId, brandId);
  const goals = useKpiGoals(organizationId, brandId);
  const invalidate = useInvalidateSocial();
  const [view, setView] = useState<KpiView>("trend");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<KpiGoalRow | null>(null);
  const [now] = useState(() => Date.now());
  const accountRows = useAccountRows(organizationId, brandId);
  const { busyRow, trackAllOwn, costText } = useTrackOwn(organizationId, brandId);

  // The agent surface: built from what is already on screen (never a fetch).
  const brandName = useMarketingBrand().name;
  useSurfaceRuntimeRegistration({
    surfaceName: SOCIAL_KPIS_SURFACE_NAME,
    isEditable: false,
    getScope: () => {
      if (data.isError || goals.isError)
        return createSocialKpisScope({
          kpis_loaded: false,
          load_error: socialErrorMessage(data.error ?? goals.error, "Could not read the KPIs."),
          brand_id: brandId,
          brand_name: brandName,
        });
      if (data.isLoading || goals.isLoading)
        return createSocialKpisScope({ kpis_loaded: false, brand_id: brandId, brand_name: brandName } as never);
      const accs = data.data?.accounts ?? [];
      const ps = data.data?.posts ?? [];
      const snaps = data.data?.snapshots ?? [];
      const kAccs = toKpiAccounts(accs);
      return createSocialKpisScope({
        kpis_loaded: true,
        brand_id: brandId,
        brand_name: brandName,
        view,
        goal_count: (goals.data ?? []).length,
        goal_metric_options: KPI_METRICS.map((m) => ({ id: m.id, label: m.label })),
        goal_scope_options: goalScopeOptions(accs).map((o) => ({ value: o.value, label: String(o.label) })),
        goals: (goals.data ?? []).map((g) => {
          const metric = goalMetricId(g);
          if (!metric) return { id: g.id, metric: g.metric_label ?? g.metric, status: "not tracked here" };
          const measured = measureGoal({ goal: g, metric, accounts: kAccs, posts: ps, now });
          const progress = goalProgress({ goal: g, metric, current: measured.value, now });
          return {
            id: g.id,
            metric: metricDefOf(metric).label,
            metric_id: metric,
            scope_value: goalScopeOf(g),
            scope: g.tracked_account_id ? "one account" : g.platform ? platformLabel(g.platform) : "own accounts",
            period: g.period,
            status: progress.status,
            current: progress.current,
            target: progress.target,
            fraction: progress.fraction,
          };
        }),
        own_trends: accs
          .filter((a) => a.role === "own" && a.profileId)
          .map((a) => {
            const mine = snaps.filter((s) => s.profile_id === a.profileId);
            return {
              platform: a.platform,
              handle: a.handle,
              followers: a.followers,
              growth_30d: judgeFollowerGrowth(mine, 30).fraction,
              points: profileFollowerSeries(mine).map((p) => [new Date(p.t).toISOString().slice(0, 10), p.value]),
            };
          }),
        benchmark: buildBenchmarkRows(accs, ps, snaps, now).map((r) => ({
          platform: r.platform,
          handle: r.handle,
          role: r.role,
          followers: r.followers,
          growth_30d: r.growth,
          posts_per_week: r.postsPerWeek,
          median_views: r.medianViews,
          engagement_rate: r.engagementRate,
          outlier_rate: r.outlierRate,
        })),
      });
    },
  });
  useSurfaceClientTools(SOCIAL_KPIS_SURFACE_NAME, {
    [SOCIAL_KPIS_TOOLS.setView]: (input) => {
      const v = (input as { view?: unknown } | null)?.view;
      if (v !== "trend" && v !== "benchmark" && v !== "own") throw new Error("view must be trend, benchmark or own.");
      setView(v);
      return `Showing ${v}.`;
    },
  });

  // Agent writes: the New goal / Edit goal / Pause / Resume / Remove buttons, through the SAME saves
  // (`saveKpiGoal`, `updateKpiGoalStatus`, `archiveKpiGoal`). Each is approved on a card first.
  const goalRows = goals.data ?? [];
  const writeScopes = goalScopeOptions(data.data?.accounts ?? []).map((o) => o.value);
  const goalRefs: GoalRef[] = goalRows.map((g) => {
    const metric = goalMetricId(g);
    return {
      id: g.id,
      label: `${metric ? metricDefOf(metric).label : g.metric_label ?? g.metric} ${g.target_value}`,
      metric,
      target: Number(g.target_value),
      period: g.period,
      scope: goalScopeOf(g),
      status: g.status,
    };
  });
  const goalWriteCtx = () => ({
    organizationId,
    brandId,
    kpiAccounts: toKpiAccounts(data.data?.accounts ?? []),
    posts: data.data?.posts ?? [],
    now: Date.now(),
  });
  useSurfaceWriteHandlers(
    SOCIAL_KPIS_SURFACE_NAME,
    collectionWriteHandlers(
      {
        plural: "goals",
        singular: "goal",
        create: {
          parse: (value) => parseCreateGoals(value, writeScopes),
          run: async (save) => {
            const id = await saveKpiGoal({ goal: null, save, ...goalWriteCtx() });
            await invalidate();
            return { id, name: `${metricDefOf(save.metric).label} ${save.target}` };
          },
          nameOf: (save) => `${save.metric} ${save.target}`,
        },
        update: {
          parse: (value) => parseUpdateGoals(value, goalRefs, writeScopes),
          run: async (plan) => {
            const row = goalRows.find((g) => g.id === plan.id);
            if (!row) throw new Error(`Goal ${plan.id} is gone.`);
            if (plan.draft) await saveKpiGoal({ goal: row, save: plan.draft, ...goalWriteCtx() });
            if (plan.status) await updateKpiGoalStatus(plan.id, plan.status);
            await invalidate();
            return { id: plan.id, name: plan.label };
          },
          nameOf: (plan) => plan.label,
          changedOf: (plan) => plan.changed,
        },
        delete: {
          parse: (value) => parseDeleteIds("delete_goals", "goals", value, goalRefs, "a goal"),
          run: async (goal) => {
            await archiveKpiGoal(goal.id);
            await invalidate();
            return { id: goal.id, name: goal.label };
          },
          nameOf: (goal) => goal.label,
        },
      },
      refuseSurfaceWrite,
    ),
  );

  if (data.isLoading || goals.isLoading) return <RegionSkeleton shape="cards" count={4} />;
  if (data.isError || goals.isError) {
    return (
      <div className="flex flex-col items-start gap-2 p-3">
        <p className="flex items-center gap-1 text-sm text-foreground">
          Couldn't load KPIs
          <ErrorAlchemyMenu error={data.error ?? goals.error} operation="load social kpis" />
        </p>
        <Button
          variant="outline"
          onClick={() => {
            void data.refetch();
            void goals.refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const accounts = data.data?.accounts ?? [];
  const posts = data.data?.posts ?? [];
  const snapshots = data.data?.snapshots ?? [];
  const kpiAccounts = toKpiAccounts(accounts);
  const own = accounts.filter((a) => a.role === "own" && a.profileId);
  const ownState = ownTrackingState(accountRows.data ?? []);
  const untrackedOwn = ownState.kind === "trackable" ? ownState.rows : [];

  async function setStatus(goal: KpiGoalRow, status: "active" | "paused") {
    try {
      await updateKpiGoalStatus(goal.id, status);
      await invalidate();
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't update the goal"));
    }
  }

  async function remove(goal: KpiGoalRow) {
    const ok = await confirm({
      title: "Remove this goal?",
      description: "Archives the goal. Account numbers are untouched.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await archiveKpiGoal(goal.id);
      await invalidate();
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't remove the goal"));
    }
  }


  return (
    <div className="matrx-touch-targets flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl aria-label="View" value={view} onValueChange={setView} data={VIEW_OPTIONS} />
        {canEdit ? (
          <Button variant="primary" icon={<Plus />} className="ml-auto" onClick={() => setCreating(true)}>
            New goal
          </Button>
        ) : null}
      </div>

      {goalRows.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Target className="h-4 w-4" aria-hidden />
          No goals yet. Set a target to track.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {goalRows.map((goal) => (
            <GoalTile
              key={goal.id}
              goal={goal}
              accounts={kpiAccounts}
              posts={posts}
              accountRows={accounts}
              now={now}
              canEdit={canEdit}
              onEdit={() => setEditing(goal)}
              onPause={() => void setStatus(goal, goal.status === "paused" ? "active" : "paused")}
              onRemove={() => void remove(goal)}
            />
          ))}
        </div>
      )}

      {view === "trend" ? (
        own.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No own accounts tracked"
            line={
              ownState.kind === "trackable"
                ? `${untrackedOwn.length} own ${untrackedOwn.length === 1 ? "account is" : "accounts are"} not tracked yet`
                : ownState.kind === "coming"
                  ? `${ownState.platforms.map(platformLabel).join(" and ")} tracking is coming; your ${ownState.platforms.length === 1 ? "account stays" : "accounts stay"} listed on Accounts`
                  : "Add an account to start tracking"
            }
            action={
              !canEdit ? null : ownState.kind === "trackable" ? (
                <Button
                  variant="primary"
                  icon={<UserPlus />}
                  disabled={busyRow !== null}
                  title={["Track every own account not tracked yet", costText("track", untrackedOwn.length)].filter(Boolean).join(" · ")}
                  onClick={() => void trackAllOwn(untrackedOwn)}
                >
                  {busyRow === "bulk" ? "Tracking…" : `Track own accounts (${untrackedOwn.length})`}
                </Button>
              ) : ownState.kind === "coming" ? (
                <Button variant="outline" asChild>
                  <Link href={`${marketingRoutes.brandSocials(brandId)}/accounts`}>Open Accounts</Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={openTrack}>
                  Track account
                </Button>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {own.slice(0, 6).map((a) => (
              <OwnTrend key={a.rowId} account={a} snapshots={snapshots} />
            ))}
          </div>
        )
      ) : null}

      {view === "benchmark" ? (
        <BenchmarkTable accounts={accounts} posts={posts} snapshots={snapshots} now={now} />
      ) : null}

      {view === "own" ? <OwnChannel accounts={accountRows.data ?? []} loading={accountRows.isLoading} /> : null}

      <GoalDialog
        open={creating || editing !== null}
        goal={editing}
        onOpenChange={(o) => {
          if (o) return;
          setCreating(false);
          setEditing(null);
        }}
        organizationId={organizationId}
        brandId={brandId}
        accounts={accounts}
        kpiAccounts={kpiAccounts}
        posts={posts}
        now={now}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Goal tile
// ---------------------------------------------------------------------------

function GoalTile({
  goal,
  accounts,
  accountRows,
  posts,
  now,
  canEdit,
  onEdit,
  onPause,
  onRemove,
}: {
  goal: KpiGoalRow;
  accounts: KpiAccount[];
  accountRows: AccountRow[];
  posts: BrandPost[];
  now: number;
  canEdit: boolean;
  onEdit: () => void;
  onPause: () => void;
  onRemove: () => void;
}) {
  const { brandSeg } = useSocials();
  const metric = goalMetricId(goal);
  if (!metric) {
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        {goal.metric_label ?? goal.metric} (not tracked here)
      </div>
    );
  }
  const measured = measureGoal({ goal, metric, accounts, posts, now });
  const progress = goalProgress({ goal, metric, current: measured.value, now });
  const def = metricDefOf(metric);
  const scopeAccount = goal.tracked_account_id
    ? accountRows.find((x) => x.trackedAccountId === goal.tracked_account_id)
    : undefined;
  const scopeHref = scopeAccount ? brandAccountHref(brandSeg, scopeAccount) : null;
  const scope = goal.tracked_account_id
    ? scopeAccount
      ? accountName(scopeAccount)
      : "Account"
    : goal.platform
      ? platformLabel(goal.platform)
      : "Own accounts";
  const pct = progress.fraction === null ? 0 : Math.round(progress.fraction * 100);

  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-card px-3 py-2">
      <span
        className="min-w-0 break-words type-meta font-medium uppercase tracking-wide text-muted-foreground"
        title={`${def.label} · ${scope}`}
      >
        {def.label} ·{" "}
        {scopeHref ? (
          <Link href={scopeHref} className="hover:underline" data-clickable="">
            {scope}
          </Link>
        ) : (
          scope
        )}
      </span>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-lg font-semibold leading-tight tabular-nums text-foreground">
          {formatKpiValue(metric, progress.current)}
          <span className="text-sm font-normal text-muted-foreground">
            {" / "}
            {formatKpiValue(metric, progress.target)}
          </span>
        </div>
        <Badge tone={STATUS_TONE[progress.status]}>{KPI_STATUS_LABELS[progress.status]}</Badge>
      </div>
      <div
        role="progressbar"
        aria-label={`${def.label} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", progress.status === "behind" ? "bg-amber-500" : progress.status === "no_history" ? "bg-muted-foreground/50" : "bg-emerald-500")}
          style={{ width: `${pct}%` }}
        />
        {def.cumulative && progress.status !== "paused" ? (
          <div
            aria-hidden
            className="absolute top-0 h-full w-0.5 bg-foreground/60"
            style={{ left: `${Math.round(progress.elapsed * 100)}%` }}
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
        <span className="min-w-0 break-words">
          {KPI_PERIODS.find((p) => p.value === goal.period)?.label ?? "Custom"} · {measured.accounts}{" "}
          {measured.accounts === 1 ? "account" : "accounts"}
        </span>
        {canEdit ? (
        <span className="flex shrink-0 items-center">
          <Button variant="quiet" icon={<Pencil />} aria-label="Edit goal" onClick={onEdit} />
          <Button
            variant="quiet"
            icon={goal.status === "paused" ? <Play /> : <Pause />}
            aria-label={goal.status === "paused" ? "Resume goal" : "Pause goal"}
            onClick={onPause}
          />
          <Button variant="quiet" icon={<Trash2 />} aria-label="Remove goal" onClick={onRemove} />
        </span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

/** An account's avatar + name in a tile: opens the account's route whenever it has one. */
function AccountNameLink({ href, children }: { href: string | null; children: ReactNode }) {
  const className = "flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground";
  return href ? (
    <Link href={href} className={cn(className, "matrx-tap-area hover:underline")} data-clickable="">
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}

function OwnTrend({
  account,
  snapshots,
}: {
  account: AccountRow;
  snapshots: readonly import("../types").ProfileSnapshotRow[];
}) {
  const { brandSeg } = useSocials();
  const mine = snapshots.filter((s) => s.profile_id === account.profileId);
  const points = profileFollowerSeries(mine);
  const growth = judgeFollowerGrowth(mine, 30);
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-card p-2">
      <div className="flex items-center justify-between gap-2">
        <AccountNameLink href={brandAccountHref(brandSeg, account)}>
          <PlatformMark platform={account.platform} size={16} />
          <span className="truncate">{accountLabels(account.displayName, account.handle, account.platform).primary}</span>
        </AccountNameLink>
        {growth.fraction === null ? (
          <span className="text-xs text-muted-foreground">{growth.note || "Not enough history for growth"}</span>
        ) : (
          <Badge tone={growth.fraction >= 0 ? "success" : "destructive"}>
            <span title={growth.note}>{formatGrowth(growth.fraction)}</span>
          </Badge>
        )}
      </div>
      <MetricChart points={points} label="Followers" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

function buildBenchmarkRows(
  accounts: AccountRow[],
  posts: BrandPost[],
  snapshots: readonly import("../types").ProfileSnapshotRow[],
  now: number,
): BenchmarkRow[] {
  return sortBenchmark(
    accounts
      .filter((a) => a.trackedAccountId)
      .map((a) => {
        const growth = judgeFollowerGrowth(snapshots.filter((s) => s.profile_id === a.profileId), 30);
        const activity = benchmarkActivity(
          posts.filter((p) => p.trackedAccountId === a.trackedAccountId),
          now,
        );
        return {
          rowId: a.rowId,
          platform: a.platform,
          handle: a.handle,
          displayName: a.displayName,
          role: a.role,
          profileUrl: a.profileUrl,
          followers: a.followers,
          growth: growth.fraction,
          growthNote: growth.note,
          profileId: a.profileId,
          propertyId: a.propertyId,
          ...activity,
        };
      }),
  );
}

function BenchmarkTable({
  accounts,
  posts,
  snapshots,
  now,
}: {
  accounts: AccountRow[];
  posts: BrandPost[];
  snapshots: readonly import("../types").ProfileSnapshotRow[];
  now: number;
}) {
  const router = useRouter();
  const { brandSeg } = useSocials();
  const rows = buildBenchmarkRows(accounts, posts, snapshots, now);
  const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
  const columns: MatrxColumnDef<BenchmarkRow>[] = [
    {
      id: "account",
      label: "Account",
      header: "Account",
      accessorFn: (r) => `${r.displayName} @${r.handle}`,
      filter: "text",
      minWidth: 200,
      cell: (r) => {
        const href = brandAccountHref(brandSeg, r);
        const body = (
          <span className="flex min-w-0 items-center gap-2">
            <PlatformMark platform={r.platform} size={18} />
            <span className="truncate">{accountLabels(r.displayName, r.handle, r.platform).primary}</span>
          </span>
        );
        return href ? (
          <Link href={href} className="block min-w-0" data-clickable="">
            {body}
          </Link>
        ) : (
          body
        );
      },
    },
    {
      id: "role",
      label: "Role",
      header: "Role",
      accessorFn: (r) => r.role,
      copyValue: (r) => TRACKED_ROLE_LABELS[r.role],
      filter: "select",
      filterOptions: Object.entries(TRACKED_ROLE_LABELS).map(([value, label]) => ({ value, label })),
      cell: (r) => TRACKED_ROLE_LABELS[r.role],
    },
    {
      id: "followers",
      label: "Followers",
      header: "Followers",
      accessorFn: (r) => r.followers,
      align: "right",
      filter: "number",
      cell: (r) => <span className="tabular-nums">{formatCompact(r.followers)}</span>,
    },
    {
      id: "growth",
      label: "30d growth",
      header: "30d growth",
      accessorFn: (r) => r.growth,
      copyValue: (r) => formatGrowth(r.growth),
      align: "right",
      filter: "number",
      cell: (r) => (
        <span className="tabular-nums" title={r.growthNote}>
          {formatGrowth(r.growth)}
        </span>
      ),
    },
    {
      id: "cadence",
      label: "Posts per week",
      header: "Posts/week",
      accessorFn: (r) => r.postsPerWeek,
      align: "right",
      filter: "number",
      cell: (r) => <span className="tabular-nums">{r.postsPerWeek === null ? "—" : r.postsPerWeek}</span>,
    },
    {
      id: "median_views",
      label: "Median views",
      header: "Median views",
      accessorFn: (r) => r.medianViews,
      align: "right",
      filter: "number",
      cell: (r) => <span className="tabular-nums">{formatCompact(r.medianViews)}</span>,
    },
    {
      id: "engagement",
      label: "Engagement rate",
      header: "Engagement",
      accessorFn: (r) => r.engagementRate,
      copyValue: (r) => pct(r.engagementRate),
      align: "right",
      filter: "number",
      cell: (r) => <span className="tabular-nums">{pct(r.engagementRate)}</span>,
    },
    {
      id: "outlier_rate",
      label: "Outlier rate",
      header: "Outlier rate",
      accessorFn: (r) => r.outlierRate,
      copyValue: (r) => pct(r.outlierRate),
      align: "right",
      filter: "number",
      cell: (r) => <span className="tabular-nums">{pct(r.outlierRate)}</span>,
    },
  ];
  return (
    <MatrxDataTable<BenchmarkRow>
      tableId="marketing-social-benchmark"
      data={rows}
      columns={columns}
      getRowId={(r) => r.rowId}
      {...socialRowOpen<BenchmarkRow>((r) => {
        if (r.profileId) router.push(`/marketing/${brandSeg}/socials/${r.platform}/${r.profileId}`);
      })}
      toolbar={{ searchPlaceholder: "Search accounts…" }}
      emptyState={{ title: "No accounts yet", description: "Track accounts to compare" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Own channel (private stats)
// ---------------------------------------------------------------------------

function OwnChannel({ accounts, loading }: { accounts: readonly AccountRow[]; loading: boolean }) {
  const { brandId, brandSeg, organizationId } = useSocials();
  return (
    <div className="flex flex-col gap-3">
      <OwnInsightsTable accounts={accounts} organizationId={organizationId} brandSeg={brandSeg} loading={loading} />
      <BrandChannelPanel brandId={brandId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// New goal
// ---------------------------------------------------------------------------

const METRIC_OPTIONS: SelectOption[] = KPI_METRICS.map((m) => ({ value: m.id, label: m.label }));
const PERIOD_OPTIONS: SelectOption[] = KPI_PERIODS.map((p) => ({ value: p.value, label: p.label }));
const ALL = "all";

/** The scopes a goal can measure: all own accounts, one platform's own accounts, or one tracked account. */
function goalScopeOptions(accounts: readonly AccountRow[]): SelectOption[] {
  return [
    { value: ALL, label: "All own accounts" },
    ...[...new Set(accounts.filter((a) => a.role === "own").map((a) => a.platform))].map((p) => ({
      value: `platform:${p}`,
      label: platformLabel(p),
    })),
    ...accounts
      .filter((a) => a.trackedAccountId)
      .map((a) => ({ value: `account:${a.trackedAccountId}`, label: `${accountName(a)} (${platformLabel(a.platform)})` })),
  ];
}

function GoalDialog({
  open,
  goal,
  onOpenChange,
  organizationId,
  brandId,
  accounts,
  kpiAccounts,
  posts,
  now,
}: {
  open: boolean;
  /** The goal being edited; null creates a new one. */
  goal: KpiGoalRow | null;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  brandId: string;
  accounts: AccountRow[];
  kpiAccounts: KpiAccount[];
  posts: BrandPost[];
  now: number;
}) {
  const invalidate = useInvalidateSocial();
  const [metric, setMetric] = useState<KpiMetricId>("followers");
  const [target, setTarget] = useState("");
  const [period, setPeriod] = useState("month");
  const [scope, setScope] = useState(ALL);
  const [busy, setBusy] = useState(false);

  // Open on the goal's own values (edit) or the defaults (new).
  useEffect(() => {
    if (!open) return;
    if (!goal) {
      setMetric("followers");
      setTarget("");
      setPeriod("month");
      setScope(ALL);
      return;
    }
    setMetric(goalMetricId(goal) ?? "followers");
    setTarget(String(goal.target_value));
    setPeriod(goal.period);
    setScope(goal.tracked_account_id ? `account:${goal.tracked_account_id}` : goal.platform ? `platform:${goal.platform}` : ALL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal?.id]);

  const scopeOptions: SelectOption[] = goalScopeOptions(accounts);
  const value = Number(target);
  const valid = Number.isFinite(value) && value > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      await saveKpiGoal({
        goal,
        save: { metric, target: value, period, scope },
        organizationId,
        brandId,
        kpiAccounts,
        posts,
        now,
      });
      await invalidate();
      setTarget("");
      onOpenChange(false);
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't save the goal"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Select aria-label="Metric" value={metric} options={METRIC_OPTIONS} onValueChange={(v) => setMetric(v as KpiMetricId)} />
          <div className="flex gap-2">
            {/* ui-exception: a raw number value, not prose */}
            <Field
              aria-label={metric === "engagement_rate" ? "Target percent" : "Target"}
              placeholder={metric === "engagement_rate" ? "Target %" : "Target"}
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="flex-1"
            />
            <Select aria-label="Period" value={period} options={PERIOD_OPTIONS} onValueChange={setPeriod} className="flex-1" />
          </div>
          <Select aria-label="Accounts" value={scope} options={scopeOptions} onValueChange={setScope} />
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!valid || busy}>
            {busy ? "Saving…" : "Save goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
