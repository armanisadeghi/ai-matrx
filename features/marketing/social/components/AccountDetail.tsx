"use client";

/**
 * Account detail (UI-SPEC §3.1) at `/socials/[platform]/[accountId]`
 * (`accountId` = the shared profile id). Header row, KPI strip, and inner
 * tabs Posts · Outliers · Growth. Posts filter by format, date window and
 * minimum multiple, and sort by newest / multiple / views, as a card grid or
 * the canonical table. Any card opens the post drawer.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";

import {
  Badge,
  Button,
  RegionSkeleton,
  SegmentedControl,
  Select,
  Tabs,
  type SelectOption,
} from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { KpiTile } from "@/components/official/kpi/KpiTile";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { toast } from "@/lib/toast";

import {
  useInvalidateSocial,
  useProfile,
  useProfilePosts,
  useProfileSnapshots,
  useTrackedForProfile,
} from "../hooks";
import {
  DEFAULT_POST_FILTER,
  filterAndSortPosts,
  formatGrowth,
  judgeFollowerGrowth,
  currentFollowers,
  postsPerWeek,
  profileFollowerSeries,
  refreshSummary,
  relativeAge,
  type PostFilter,
  type PostSort,
} from "../mappers";
import { OUTLIER_TIER_THRESHOLDS, formatCompact, formatPercentile, profileBaseline } from "../outlier";
import { refreshProfile, socialErrorMessage } from "../server";
import { TRACKED_ROLE_LABELS, isTrackedRole, type PostCardModel } from "../types";
import { MetricChart, seriesToCsv } from "./MetricChart";
import { OutlierBadge } from "./OutlierBadge";
import { PlatformMark, platformLabel } from "./PlatformMark";
import { PostDrawer } from "./PostDetail";
import { SocialPostCard } from "./SocialPostCard";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";

type InnerTab = "posts" | "outliers" | "growth";
const INNER_TABS = [
  { value: "posts", label: "Posts" },
  { value: "outliers", label: "Outliers" },
  { value: "growth", label: "Growth" },
] as const;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "multiple", label: "Multiple" },
  { value: "views", label: "Views" },
] as const;

const WINDOW_OPTIONS: SelectOption[] = [
  { value: "0", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
const MIN_OPTIONS: SelectOption[] = [
  { value: "0", label: "Any multiple" },
  { value: "2", label: "2x and up" },
  { value: "4", label: "4x and up" },
  { value: "10", label: "10x and up" },
];
const RANGE_OPTIONS = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "0", label: "All" },
] as const;

const POST_COLUMNS: MatrxColumnDef<PostCardModel>[] = [
  {
    id: "post",
    label: "Post",
    header: "Post",
    accessorFn: (r) => r.hookLine,
    filter: "text",
    minWidth: 240,
    cell: (r) => <span className="block max-w-[28rem] truncate">{r.hookLine || "No caption"}</span>,
  },
  { id: "format", label: "Format", header: "Format", accessorKey: "format", filter: "select" },
  {
    id: "multiple",
    label: "Multiple",
    header: "Multiple",
    accessorFn: (r) => r.outlierScore,
    align: "right",
    filter: "number",
    cell: (r) => <OutlierBadge input={r.outlier} />,
  },
  {
    id: "percentile",
    label: "Percentile",
    header: "Pctl",
    accessorFn: (r) => r.percentile,
    copyValue: (r) => formatPercentile(r.percentile),
    align: "right",
    filter: "number",
    hidden: true,
    cell: (r) => formatPercentile(r.percentile),
  },
  {
    id: "views",
    label: "Views",
    header: "Views",
    accessorFn: (r) => r.views,
    align: "right",
    filter: "number",
    cell: (r) => <span className="tabular-nums">{formatCompact(r.views)}</span>,
  },
  {
    id: "likes",
    label: "Likes",
    header: "Likes",
    accessorFn: (r) => r.likes,
    align: "right",
    filter: "number",
    cell: (r) => <span className="tabular-nums">{formatCompact(r.likes)}</span>,
  },
  {
    id: "posted",
    label: "Posted",
    header: "Posted",
    accessorFn: (r) => r.postedAt,
    filter: "date",
    cell: (r) => relativeAge(r.postedAt),
  },
];

function PostsPanel({
  posts,
  mode,
  onOpen,
}: {
  posts: PostCardModel[];
  mode: "posts" | "outliers";
  onOpen: (p: PostCardModel) => void;
}) {
  const [filter, setFilter] = useState<PostFilter>(DEFAULT_POST_FILTER);
  const [sort, setSort] = useState<PostSort>(mode === "outliers" ? "multiple" : "newest");
  const [view, setView] = useState<"grid" | "table">("grid");

  const effective: PostFilter =
    mode === "outliers"
      ? { ...filter, minMultiple: Math.max(filter.minMultiple, OUTLIER_TIER_THRESHOLDS.neutral) }
      : filter;
  const shown = useMemo(() => filterAndSortPosts(posts, effective, sort), [posts, effective, sort]);
  const formats = useMemo(
    () => [
      { value: "all", label: "All formats" },
      ...[...new Set(posts.map((p) => p.format))].sort().map((f) => ({ value: f, label: f })),
    ],
    [posts],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Format" value={filter.format} options={formats} onValueChange={(v) => setFilter({ ...filter, format: v })} />
        <Select
          aria-label="Date window"
          value={String(filter.windowDays)}
          options={WINDOW_OPTIONS}
          onValueChange={(v) => setFilter({ ...filter, windowDays: Number(v) })}
        />
        <Select
          aria-label="Minimum multiple"
          value={String(filter.minMultiple)}
          options={MIN_OPTIONS}
          onValueChange={(v) => setFilter({ ...filter, minMultiple: Number(v) })}
        />
        <SegmentedControl aria-label="Sort" value={sort} onValueChange={setSort} data={SORT_OPTIONS} />
        <SegmentedControl
          aria-label="View"
          value={view}
          onValueChange={setView}
          data={[
            { value: "grid", label: "Grid" },
            { value: "table", label: "Table" },
          ]}
          className="ml-auto"
        />
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {mode === "outliers" ? "No outliers in range" : "No posts match"}
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {shown.map((p) => (
            <SocialPostCard key={p.postId} post={p} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <MatrxDataTable<PostCardModel>
          tableId={`marketing-social-posts-${mode}`}
          data={shown}
          columns={POST_COLUMNS}
          getRowId={(r) => r.postId}
          toolbar={{ searchPlaceholder: "Search posts…" }}
          rowActions={(r) => [
            {
              id: "open",
              icon: ExternalLink,
              label: "Open post",
              onClick: () => onOpen(r),
            },
          ]}
        />
      )}
    </div>
  );
}

function GrowthPanel({ profileId }: { profileId: string }) {
  const snapshots = useProfileSnapshots(profileId);
  const [range, setRange] = useState<string>("90");
  const [now] = useState(() => Date.now());
  if (snapshots.isLoading) return <RegionSkeleton shape="rows" count={4} />;
  const all = profileFollowerSeries(snapshots.data ?? []);
  const cutoff = range === "0" ? 0 : now - Number(range) * 86_400_000;
  const points = all.filter((p) => p.t >= cutoff);
  const growth = judgeFollowerGrowth(snapshots.data ?? [], range === "0" ? 90 : Number(range));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl aria-label="Range" value={range} onValueChange={setRange} data={RANGE_OPTIONS} />
        <span className="flex items-center gap-2">
          <Badge tone={growth.fraction === null ? "neutral" : growth.fraction >= 0 ? "success" : "destructive"}>
            <span title={growth.note}>{formatGrowth(growth.fraction)}</span>
          </Badge>
          <Button
            variant="quiet"
            disabled={points.length === 0}
            onClick={() => void navigator.clipboard.writeText(seriesToCsv("Followers", points)).then(() => toast.success("CSV copied"))}
          >
            CSV
          </Button>
        </span>
      </div>
      <MetricChart points={points} label="Followers" />
      <p className="min-h-4 text-[11px] text-muted-foreground">{growth.fraction === null ? growth.note : ""}</p>
    </div>
  );
}

export function AccountDetail({ platform, profileId }: { platform: string; profileId: string }) {
  const brand = useMarketingBrand();
  const router = useRouter();
  const invalidate = useInvalidateSocial();
  const profile = useProfile(profileId);
  const tracked = useTrackedForProfile(brand.organizationId, profileId);
  const handle = profile.data?.handle ?? null;
  const posts = useProfilePosts(profileId, handle);
  const snapshots = useProfileSnapshots(profileId);
  const [tab, setTab] = useState<InnerTab>("posts");
  const [open, setOpen] = useState<PostCardModel | null>(null);
  const [busy, setBusy] = useState(false);
  // The refresh's inline home: its live stage while running, then what it did
  // (or why it failed), beside the button that started it.
  const [refreshLine, setRefreshLine] = useState<{ text: string; failed: boolean; error?: unknown } | null>(null);

  async function refresh() {
    const ok = await confirm({
      title: `Refresh @${handle ?? ""}?`,
      description: "Fetches the latest posts and numbers. Costs about 1 credit per page, billed to this organization.",
      confirmLabel: "Refresh",
    });
    if (!ok) return;
    setBusy(true);
    setRefreshLine({ text: "Starting…", failed: false });
    try {
      const result = await refreshProfile(profileId, { pages: 1 }, {
        organizationId: brand.organizationId,
        onProgress: (pr) =>
          setRefreshLine({ text: pr.step && pr.total ? `${pr.message} · ${pr.step} of ${pr.total}` : pr.message, failed: false }),
      });
      await invalidate();
      setRefreshLine({ text: refreshSummary(result), failed: false });
    } catch (err) {
      setRefreshLine({ text: socialErrorMessage(err, "Refresh failed"), failed: true, error: err });
    } finally {
      setBusy(false);
    }
  }

  if (profile.isLoading) return <RegionSkeleton shape="cards" count={2} />;
  if (profile.isError || !profile.data) {
    return (
      <div className="flex flex-col items-start gap-2 p-3">
        <p className="flex items-center gap-1 text-sm text-foreground">
          {profile.isError ? "Couldn't load this account" : "Account not found"}
          {profile.isError ? <ErrorAlchemyMenu error={profile.error} operation="load social account" /> : null}
        </p>
        <Button variant="outline" onClick={() => router.back()}>
          Back
        </Button>
      </div>
    );
  }

  const p = profile.data;
  const list = posts.data ?? [];
  const role = tracked.data && isTrackedRole(tracked.data.role) ? tracked.data.role : null;
  const growth = judgeFollowerGrowth(snapshots.data ?? []);
  const baseline = profileBaseline(list);
  const followers = currentFollowers(p.follower_count, snapshots.data ?? []);
  const best = list.reduce<PostCardModel | null>(
    (acc, x) => (x.outlierScore !== null && (acc === null || x.outlierScore > (acc.outlierScore ?? -1)) ? x : acc),
    null,
  );
  const perWeek = postsPerWeek(list);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        <Button variant="quiet" icon={<ArrowLeft />} aria-label="Back" onClick={() => router.back()} />
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover" />
        ) : null}
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold text-foreground">{p.display_name || p.handle}</span>
          <span className="truncate text-xs text-muted-foreground">{formatSocialHandle({ platform: p.platform, handle: p.handle, url: p.profile_url })}</span>
        </div>
        <span title={platformLabel(platform)}>
          <PlatformMark platform={p.platform} size={20} />
        </span>
        {role ? <Badge>{TRACKED_ROLE_LABELS[role]}</Badge> : <Badge tone="warning">Not tracked</Badge>}
        <span className="ml-auto flex min-w-0 items-center gap-1">
          {refreshLine ? (
            <span
              role="status"
              aria-live="polite"
              title={refreshLine.text}
              className={`flex min-w-0 max-w-[44ch] items-center truncate text-xs ${refreshLine.failed ? "text-destructive" : "text-muted-foreground"}`}
            >
              <span className="truncate">{refreshLine.text}</span>
              {refreshLine.failed ? <ErrorAlchemyMenu error={refreshLine.error} operation="refresh social account" /> : null}
            </span>
          ) : null}
          {tracked.data ? (
            <Button variant="outline" icon={<RefreshCw />} onClick={() => void refresh()} disabled={busy} title="Refresh · about 1 credit per page">
              {busy ? "Refreshing…" : "Refresh"}
            </Button>
          ) : null}
          {p.profile_url ? (
            <Button variant="quiet" icon={<ExternalLink />} asChild>
              <Link href={p.profile_url} target="_blank" rel="noreferrer noopener">
                Open on platform
              </Link>
            </Button>
          ) : null}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Followers" value={followers === null ? null : formatCompact(followers)} />
        <KpiTile label="30d growth" value={growth.fraction === null ? null : formatGrowth(growth.fraction)} hint={growth.fraction === null ? growth.note : undefined} title="Follower change between snapshots about 30 days apart." />
        <KpiTile label="Posts / week" value={perWeek === null ? null : String(perWeek)} title="Posts in the last 30 days, per week." />
        <KpiTile label="Median views" value={baseline.medianViews === null ? null : formatCompact(baseline.medianViews)} title="Median views of this creator's latest 30 posts." />
        <KpiTile
          label="Best multiple"
          value={best ? <OutlierBadge input={best.outlier} /> : null}
          title="Highest outlier multiple among this creator's posts."
        />
        <KpiTile label="Posts tracked" value={posts.isLoading ? null : String(list.length)} loading={posts.isLoading} />
      </div>

      <Tabs aria-label="Account sections" value={tab} onValueChange={setTab} data={INNER_TABS} />
      {posts.isLoading ? (
        <RegionSkeleton shape="cards" count={4} />
      ) : posts.isError ? (
        <div className="flex items-center gap-2 text-sm">
          Couldn't load posts
          <ErrorAlchemyMenu error={posts.error} operation="load social posts" />
          <Button variant="outline" onClick={() => void posts.refetch()}>
            Retry
          </Button>
        </div>
      ) : tab === "growth" ? (
        <GrowthPanel profileId={profileId} />
      ) : (
        <PostsPanel key={tab} posts={list} mode={tab} onOpen={setOpen} />
      )}
      <PostDrawer post={open} onClose={() => setOpen(null)} />
    </div>
  );
}
