"use client";

/**
 * KPIs (UI-SPEC §8): the brand's goals with current-vs-target computed from
 * stored snapshots and post stats (`kpi.ts` holds every rule), a follower
 * trend per own account, a benchmark of own accounts against tracked
 * competitors, and the owned YouTube channel's private numbers where they
 * exist. Other platforms' private stats wait on platform approvals and say so.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { Lock, Pause, Pencil, Play, Plus, Target, Trash2, UserPlus, Users } from "lucide-react";

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
import { formatGrowth, judgeFollowerGrowth, profileFollowerSeries } from "../mappers";
import { formatCompact } from "../outlier";
import { socialErrorMessage } from "../server";
import { archiveKpiGoal, createKpiGoal, updateKpiGoal, updateKpiGoalStatus } from "../service";
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
import { useTrackOwn } from "./useTrackOwn";
import { ownTrackingState } from "../own-accounts";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";

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
  const { brandId, organizationId, openTrack } = useSocials();
  const data = useBrandSocialData(organizationId, brandId);
  const goals = useKpiGoals(organizationId, brandId);
  const invalidate = useInvalidateSocial();
  const [view, setView] = useState<KpiView>("trend");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<KpiGoalRow | null>(null);
  const [now] = useState(() => Date.now());
  const accountRows = useAccountRows(organizationId, brandId);
  const { busyRow, trackAllOwn, costText } = useTrackOwn(organizationId, brandId);

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

  const goalRows = goals.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl aria-label="View" value={view} onValueChange={setView} data={VIEW_OPTIONS} />
        <Button variant="primary" icon={<Plus />} className="ml-auto" onClick={() => setCreating(true)}>
          New goal
        </Button>
      </div>

      {goalRows.length === 0 ? (
        <EmptyState
          icon={<Target className="h-5 w-5" />}
          title="No goals"
          line="Set a target for followers, views or cadence"
          action={
            <Button variant="outline" icon={<Plus />} onClick={() => setCreating(true)}>
              New goal
            </Button>
          }
        />
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
              ownState.kind === "trackable" ? (
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

      {view === "own" ? <OwnChannel /> : null}

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
  onEdit,
  onPause,
  onRemove,
}: {
  goal: KpiGoalRow;
  accounts: KpiAccount[];
  accountRows: AccountRow[];
  posts: BrandPost[];
  now: number;
  onEdit: () => void;
  onPause: () => void;
  onRemove: () => void;
}) {
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
  const scope = goal.tracked_account_id
    ? (() => {
        const a = accountRows.find((x) => x.trackedAccountId === goal.tracked_account_id);
        return a ? formatSocialHandle({ platform: a.platform, handle: a.handle, url: a.profileUrl }) : "Account";
      })()
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
        {def.label} · {scope}
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
          className={cn("h-full rounded-full", progress.status === "behind" ? "bg-amber-500" : "bg-emerald-500")}
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
      <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
        <span className="truncate">
          {KPI_PERIODS.find((p) => p.value === goal.period)?.label ?? "Custom"} · {measured.accounts}{" "}
          {measured.accounts === 1 ? "account" : "accounts"}
        </span>
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

function OwnTrend({
  account,
  snapshots,
}: {
  account: AccountRow;
  snapshots: readonly import("../types").ProfileSnapshotRow[];
}) {
  const mine = snapshots.filter((s) => s.profile_id === account.profileId);
  const points = profileFollowerSeries(mine);
  const growth = judgeFollowerGrowth(mine, 30);
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-card p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          <PlatformMark platform={account.platform} size={16} />
          <span className="truncate">{formatSocialHandle({ platform: account.platform, handle: account.handle, url: account.profileUrl })}</span>
        </span>
        <Badge tone={growth.fraction === null ? "neutral" : growth.fraction >= 0 ? "success" : "destructive"}>
          <span title={growth.note}>{formatGrowth(growth.fraction)}</span>
        </Badge>
      </div>
      <MetricChart points={points} label="Followers" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

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
  const rows: BenchmarkRow[] = sortBenchmark(
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
          ...activity,
        };
      }),
  );
  const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
  const columns: MatrxColumnDef<BenchmarkRow>[] = [
    {
      id: "account",
      label: "Account",
      header: "Account",
      accessorFn: (r) => `${r.displayName} @${r.handle}`,
      filter: "text",
      minWidth: 200,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <PlatformMark platform={r.platform} size={18} />
          <span className="truncate">{formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })}</span>
        </span>
      ),
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
      toolbar={{ searchPlaceholder: "Search accounts…" }}
      emptyState={{ title: "No accounts yet", description: "Track accounts to compare" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Own channel (private stats)
// ---------------------------------------------------------------------------

function OwnChannel() {
  const { brandId } = useSocials();
  return (
    <div className="flex flex-col gap-3">
      <BrandChannelPanel brandId={brandId} />
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        <Lock className="h-4 w-4 shrink-0" />
        <span>Instagram, TikTok, LinkedIn</span>
        <Badge tone="neutral">Coming with platform approvals</Badge>
        <span className="text-xs">Connect to see private stats</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New goal
// ---------------------------------------------------------------------------

const METRIC_OPTIONS: SelectOption[] = KPI_METRICS.map((m) => ({ value: m.id, label: m.label }));
const PERIOD_OPTIONS: SelectOption[] = KPI_PERIODS.map((p) => ({ value: p.value, label: p.label }));
const ALL = "all";

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

  const scopeOptions: SelectOption[] = [
    { value: ALL, label: "All own accounts" },
    ...[...new Set(accounts.filter((a) => a.role === "own").map((a) => a.platform))].map((p) => ({
      value: `platform:${p}`,
      label: platformLabel(p),
    })),
    ...accounts
      .filter((a) => a.trackedAccountId)
      .map((a) => ({ value: `account:${a.trackedAccountId}`, label: `${formatSocialHandle({ platform: a.platform, handle: a.handle, url: a.profileUrl })} (${platformLabel(a.platform)})` })),
  ];
  const value = Number(target);
  const valid = Number.isFinite(value) && value > 0;

  async function submit() {
    if (!valid) return;
    const def = metricDefOf(metric);
    const accountId = scope.startsWith("account:") ? scope.slice(8) : null;
    const platform = scope.startsWith("platform:") ? scope.slice(9) : null;
    const draft = {
      tracked_account_id: accountId,
      platform,
      period,
      starts_on: new Date(now).toISOString().slice(0, 10),
      ends_on: null,
    };
    // The baseline: where the number stands today, so a cumulative goal's
    // pace is progress made since the goal was set.
    const baseline = def.cumulative ? measureGoal({ goal: draft, metric, accounts: kpiAccounts, posts, now }).value : null;
    setBusy(true);
    try {
      if (goal) {
        // Re-baseline only when what is measured changed; a target or period edit keeps the pace origin.
        const sameSubject =
          goalMetricId(goal) === metric && goal.platform === platform && goal.tracked_account_id === accountId;
        await updateKpiGoal(goal.id, {
          metric: def.db,
          metricLabel: def.dbLabel,
          targetValue: value,
          baselineValue: sameSubject ? goal.baseline_value : metric === "outlier_count" ? 0 : baseline,
          period,
          platform,
          trackedAccountId: accountId,
        });
      } else {
        await createKpiGoal({
          organizationId,
          brandId,
          metric: def.db,
          metricLabel: def.dbLabel,
          targetValue: value,
          baselineValue: metric === "outlier_count" ? 0 : baseline,
          period,
          startsOn: draft.starts_on,
          endsOn: null,
          platform,
          trackedAccountId: accountId,
        });
      }
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
