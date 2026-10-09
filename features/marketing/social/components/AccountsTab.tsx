"use client";

/**
 * Accounts (UI-SPEC §3): the brand's own accounts and the competitor /
 * inspiration / client accounts it tracks, in ONE `MatrxDataTable`. One column
 * per sortable/filterable value; Role filters as a column, so "group by role"
 * is the table's own filter + drill-down, not a hand-built grouping.
 *
 * Row actions: Refresh (confirm names the credit spend) and Remove (confirm
 * names what is archived). Role is editable inline (Layer B edit under RLS).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";

import { Badge, Button, Select, type SelectOption } from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import { useAccountRows, useInvalidateSocial } from "../hooks";
import { formatGrowth, lastPostLabel, refreshSummary, relativeAge } from "../mappers";
import { formatCompact, formatPercentile, outlierBadgeModel } from "../outlier";
import {
  refreshProfile,
  socialErrorCode,
  socialErrorCredits,
  socialErrorMessage,
  trackAccount,
  untrackAccount,
} from "../server";
import { setTrackedRole } from "../service";
import {
  SOCIAL_PLATFORM_LABELS,
  TRACKED_ROLES,
  TRACKED_ROLE_LABELS,
  TRACKABLE_PLATFORMS,
  isSocialPlatform,
  type AccountRow,
  type TrackedRole,
} from "../types";
import { OutlierBadge } from "./OutlierBadge";
import { PlatformMark } from "./PlatformMark";
import { useSocials } from "./SocialsContext";
import { TRACK_CREDITS, trackableOwn, useTrackOwn } from "./useTrackOwn";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";

const ROLE_OPTIONS: SelectOption<TrackedRole>[] = TRACKED_ROLES.map((r) => ({
  value: r,
  label: TRACKED_ROLE_LABELS[r],
}));

export function accountHref(brandSeg: string, row: Pick<AccountRow, "platform" | "profileId">): string | null {
  return row.profileId
    ? `/marketing/${brandSeg}/socials/${row.platform}/${row.profileId}`
    : null;
}

export function AccountsTab() {
  const { brandId, brandSeg, organizationId, openTrack } = useSocials();
  const accounts = useAccountRows(organizationId, brandId);
  const invalidate = useInvalidateSocial();
  const { busyRow, setBusyRow, trackOwn, trackAllOwn } = useTrackOwn(organizationId, brandId);

  async function refresh(row: AccountRow) {
    if (!row.profileId) return;
    const ok = await confirm({
      title: `Refresh @${row.handle}?`,
      description: "Fetches the latest posts and numbers. Costs about 1 credit per page, billed to this organization.",
      confirmLabel: "Refresh",
    });
    if (!ok) return;
    setBusyRow(row.rowId);
    try {
      const result = await refreshProfile(row.profileId, { pages: 1 }, { organizationId });
      await invalidate();
      toast.success(refreshSummary(result));
    } catch (err) {
      toast.error(socialErrorMessage(err, "Refresh failed"));
    } finally {
      setBusyRow(null);
    }
  }

  async function remove(row: AccountRow) {
    if (!row.trackedAccountId) return;
    const ok = await confirm({
      title: `Stop tracking @${row.handle}?`,
      description: "Archives this tracked account for your organization. Saved posts and history stay in the shared cache.",
      confirmLabel: "Stop tracking",
      variant: "destructive",
    });
    if (!ok) return;
    setBusyRow(row.rowId);
    try {
      await untrackAccount(row.trackedAccountId, { organizationId });
      await invalidate();
      toast.success("Account removed");
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't remove the account"));
    } finally {
      setBusyRow(null);
    }
  }

  async function changeRole(row: AccountRow, role: TrackedRole) {
    if (!row.trackedAccountId || role === row.role) return;
    try {
      await setTrackedRole(row.trackedAccountId, role);
      await invalidate();
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't change the role"));
    }
  }

  const columns = useMemo<MatrxColumnDef<AccountRow>[]>(
    () => [
      {
        id: "account",
        label: "Account",
        header: "Account",
        accessorFn: (r) => `${r.displayName} ${formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })}`,
        copyValue: (r) => `${r.displayName} (${formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })})`,
        filter: "text",
        minWidth: 220,
        cell: (r) => {
          const href = accountHref(brandSeg, r);
          const body = (
            <span className="flex min-w-0 items-center gap-2">
              <PlatformMark platform={r.platform} size={20} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-medium text-foreground">{r.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })}</span>
              </span>
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
        id: "platform",
        label: "Platform",
        header: "Platform",
        accessorKey: "platform",
        copyValue: (r) => (isSocialPlatform(r.platform) ? SOCIAL_PLATFORM_LABELS[r.platform] : r.platform),
        filter: "select",
        filterOptions: Object.entries(SOCIAL_PLATFORM_LABELS).map(([value, label]) => ({ value, label })),
        cell: (r) => (isSocialPlatform(r.platform) ? SOCIAL_PLATFORM_LABELS[r.platform] : r.platform),
      },
      {
        id: "role",
        label: "Role",
        header: "Role",
        accessorKey: "role",
        copyValue: (r) => TRACKED_ROLE_LABELS[r.role],
        filter: "select",
        filterOptions: TRACKED_ROLES.map((r) => ({ value: r, label: TRACKED_ROLE_LABELS[r] })),
        cell: (r) =>
          r.trackedAccountId ? (
            <Select
              aria-label={`Role for @${r.handle}`}
              value={r.role}
              options={ROLE_OPTIONS}
              onValueChange={(v) => void changeRole(r, v)}
            />
          ) : (
            TRACKED_ROLE_LABELS[r.role]
          ),
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
        id: "posts",
        label: "Posts tracked",
        header: "Posts",
        accessorFn: (r) => r.postsTracked,
        align: "right",
        filter: "number",
        cell: (r) =>
          r.trackedAccountId && r.postsTracked === 0 ? (
            <span title="No posts stored for this account. Check the handle, or Refresh.">
              <Badge tone="warning">No posts</Badge>
            </span>
          ) : (
            <span className="tabular-nums">{r.postsTracked}</span>
          ),
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
        id: "best",
        label: "Best multiple",
        header: "Best multiple",
        accessorFn: (r) => r.bestScore,
        copyValue: (r) => outlierBadgeModel({ score: r.bestScore, baselineViews: null, percentile: null, baselineWindow: null, ageHours: null, accountPosts: r.postsTracked }).text,
        align: "right",
        filter: "number",
        cell: (r) => (
          <OutlierBadge
            input={{ score: r.bestScore, baselineViews: null, percentile: null, baselineWindow: null, ageHours: null, accountPosts: r.postsTracked }}
          />
        ),
      },
      {
        id: "last_post",
        label: "Last post",
        header: "Last post",
        accessorFn: (r) => r.lastPostAt,
        filter: "date",
        copyValue: (r) => lastPostLabel(r.lastPostAt, r.postsTracked),
        cell: (r) => (
          <span className="tabular-nums" title={r.lastPostAt ?? "No post date stored"}>
            {lastPostLabel(r.lastPostAt, r.postsTracked)}
          </span>
        ),
      },
      {
        id: "refreshed",
        label: "Last refreshed",
        header: "Refreshed",
        accessorFn: (r) => r.lastRefreshedAt,
        filter: "date",
        hidden: true,
        cell: (r) => relativeAge(r.lastRefreshedAt),
      },
      {
        id: "status",
        label: "Status",
        header: "Status",
        accessorKey: "status",
        filter: "select",
        cell: (r) => (r.status === "not_tracked" ? "Not tracked" : r.status === "active" ? "Active" : r.status),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandSeg, organizationId],
  );

  const rows = accounts.data ?? [];
  const untrackedOwn = rows.filter(trackableOwn);

  return (
    <MatrxDataTable<AccountRow>
      tableId="marketing-social-accounts"
      urlState={{ id: "social-accounts" }}
      data={rows}
      columns={columns}
      getRowId={(r) => r.rowId}
      isLoading={accounts.isLoading}
      isFetching={accounts.isFetching}
      read={{
        status: accounts.isError ? "error" : accounts.isLoading ? "loading" : "ready",
        error: accounts.error ?? undefined,
        onRetry: () => void accounts.refetch(),
      }}
      toolbar={{
        searchPlaceholder: "Search accounts…",
        actions:
          untrackedOwn.length > 1 ? (
            <Button
              variant="outline"
              icon={<UserPlus />}
              disabled={busyRow !== null}
              title={`Track every own account not tracked yet · about ${untrackedOwn.length * TRACK_CREDITS} credits`}
              onClick={() => void trackAllOwn(untrackedOwn)}
            >
              {busyRow === "bulk" ? "Tracking…" : `Track all own (${untrackedOwn.length})`}
            </Button>
          ) : undefined,
      }}
      defaultSort={{ id: "followers", direction: "desc" }}
      rowActions={(row) => [
        row.trackedAccountId
          ? {
              id: "refresh",
              icon: RefreshCw,
              label: "Refresh",
              tooltip: "Refresh · about 1 credit per page",
              loading: busyRow === row.rowId,
              disabled: busyRow !== null,
              onClick: () => void refresh(row),
            }
          : trackableOwn(row)
            ? {
                id: "track",
                icon: UserPlus,
                label: "Track",
                tooltip: `Track as Own · about ${TRACK_CREDITS} credits`,
                loading: busyRow === row.rowId,
                disabled: busyRow !== null,
                onClick: () => void trackOwn(row),
              }
            : {
                id: "track",
                icon: UserPlus,
                label: "Track",
                tooltip: `${isSocialPlatform(row.platform) ? SOCIAL_PLATFORM_LABELS[row.platform] : row.platform} is not supported yet`,
                disabled: true,
                onClick: () => openTrack(),
              },
        ...(row.trackedAccountId
          ? [
              {
                id: "remove",
                icon: Trash2,
                label: "Stop tracking",
                tone: "destructive" as const,
                disabled: busyRow !== null,
                onClick: () => void remove(row),
              },
            ]
          : []),
      ]}
      emptyState={{
        title: "No accounts yet",
        description: "Paste a profile link",
        action: (
          <Button variant="primary" icon={<Plus />} onClick={openTrack}>
            Track account
          </Button>
        ),
      }}
    />
  );
}

