"use client";

/**
 * Accounts (UI-SPEC §3): the brand's own accounts and the competitor /
 * inspiration / client accounts it tracks, in ONE `MatrxDataTable`. One column
 * per sortable/filterable value; Role filters as a column, so "group by role"
 * is the table's own filter + drill-down, not a hand-built grouping.
 *
 * Row actions: Refresh (names its points only when worth a warning) and Remove (confirm
 * names what is archived). Role is editable inline (Layer B edit under RLS).
 */

import Link from "next/link";
import { SocialConnectionsPanel } from "@/features/social-connections/SocialConnectionsPanel";
import { CustomerAccountsPanel } from "@/features/social-connections/CustomerAccountsPanel";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Globe, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";

import {
  Badge,
  Button,
  Select,
  type SelectOption,
} from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { useRefusedRead } from "../gated/RefusedReadOffer";
import { GUIDED_CAPTURE_PLATFORMS } from "../gated/guidedJob";

import { useAccountRows, useInvalidateSocial } from "../hooks";
import {
  accountLabels,
  formatGrowth,
  lastPostLabel,
  refreshSummary,
  relativeAge,
  showOwnerChip,
} from "../mappers";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { formatCompact, formatPercentile, outlierBadgeModel } from "../outlier";
import {
  refreshProfile,
  socialErrorCode,
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
import { PersonOwnerChip } from "../../components/brands/PersonOwnerChip";
import { socialRowOpen } from "../row-open";
import { AccountSummary } from "./AccountSummary";
import { OutlierBadge } from "./OutlierBadge";
import { PlatformMark } from "./PlatformMark";
import { useSocials } from "./SocialsContext";
import { trackableOwn, useTrackOwn } from "./useTrackOwn";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";

const ROLE_OPTIONS: SelectOption<TrackedRole>[] = TRACKED_ROLES.map((r) => ({
  value: r,
  label: TRACKED_ROLE_LABELS[r],
}));

export function accountHref(
  brandSeg: string,
  row: Pick<AccountRow, "platform" | "profileId">,
): string | null {
  return row.profileId
    ? `/marketing/${brandSeg}/socials/${row.platform}/${row.profileId}`
    : null;
}

export function AccountsTab() {
  const { brandId, brandSeg, organizationId, openTrack } = useSocials();
  const brandKind = useMarketingBrand().kind;
  const router = useRouter();
  const [showXConnections, setShowXConnections] = useState(false);
  const [summaryRow, setSummaryRow] = useState<AccountRow | null>(null);
  const accounts = useAccountRows(organizationId, brandId);
  const invalidate = useInvalidateSocial();
  const {
    busyRow,
    progress,
    setBusyRow,
    trackOwn,
    trackAllOwn,
    costText,
    confirmSpend,
  } = useTrackOwn(organizationId, brandId);

  const {
    show: showRefused,
    open: openCapture,
    node: captureNode,
  } = useRefusedRead(organizationId, () => void invalidate());
  const [refusedRows, setRefusedRows] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const captureTarget = (row: AccountRow) => ({
    platform: row.platform,
    handleOrUrl: row.profileUrl || row.handle,
    ...(row.profileId ? { profileId: row.profileId } : {}),
    ...(row.trackedAccountId ? { trackedAccountId: row.trackedAccountId } : {}),
    ...(row.propertyId ? { propertyId: row.propertyId } : {}),
    brandId,
  });

  async function refresh(row: AccountRow) {
    if (!row.profileId) return;
    const ok = await confirmSpend("profile_page", 1, {
      title: `Refresh @${row.handle}?`,
      confirmLabel: "Refresh",
    });
    if (!ok) return;
    setBusyRow(row.rowId);
    try {
      const result = await refreshProfile(
        row.profileId,
        { pages: 1 },
        { organizationId },
      );
      await invalidate();
      toast.success(refreshSummary(result));
    } catch (err) {
      setRefusedRows((prev) => new Set(prev).add(row.rowId));
      if (!showRefused(err, captureTarget(row)))
        toast.error(socialErrorMessage(err, "Refresh failed"));
    } finally {
      setBusyRow(null);
    }
  }

  async function remove(row: AccountRow) {
    if (!row.trackedAccountId) return;
    const ok = await confirm({
      title: `Stop tracking @${row.handle}?`,
      description:
        "Archives this tracked account for your organization. Saved posts and history stay in the shared cache.",
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
        accessorFn: (r) =>
          `${r.displayName} ${formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })}`,
        copyValue: (r) =>
          `${r.displayName} (${formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })})`,
        filter: "text",
        minWidth: 220,
        cell: (r) => {
          const href = accountHref(brandSeg, r);
          const labels = accountLabels(r.displayName, r.handle, r.platform);
          const platformName = isSocialPlatform(r.platform)
            ? SOCIAL_PLATFORM_LABELS[r.platform]
            : r.platform;
          const body = (
            <span className="flex min-w-0 items-center gap-2">
              <PlatformMark platform={r.platform} size={20} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-foreground">
                    {labels.primary}
                  </span>
                  {showOwnerChip(r, brandKind) ? (
                    <PersonOwnerChip
                      propertyId={r.propertyId ?? null}
                      ownerName={r.ownerName ?? null}
                      organizationId={organizationId}
                      brandId={brandId}
                    />
                  ) : null}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {[
                    platformName,
                    labels.secondary
                      ? formatSocialHandle({
                          platform: r.platform,
                          handle: r.handle,
                          url: r.profileUrl,
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
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
        copyValue: (r) =>
          isSocialPlatform(r.platform)
            ? SOCIAL_PLATFORM_LABELS[r.platform]
            : r.platform,
        hidden: true, // the platform name already sits under the account name; the column stays for filtering
        filter: "select",
        filterOptions: Object.entries(SOCIAL_PLATFORM_LABELS).map(
          ([value, label]) => ({ value, label }),
        ),
        cell: (r) =>
          isSocialPlatform(r.platform)
            ? SOCIAL_PLATFORM_LABELS[r.platform]
            : r.platform,
      },
      {
        id: "role",
        label: "Role",
        header: "Role",
        accessorKey: "role",
        copyValue: (r) => TRACKED_ROLE_LABELS[r.role],
        filter: "select",
        filterOptions: TRACKED_ROLES.map((r) => ({
          value: r,
          label: TRACKED_ROLE_LABELS[r],
        })),
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
        cell: (r) => (
          <span className="tabular-nums">{formatCompact(r.followers)}</span>
        ),
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
        id: "best",
        label: "Best multiple",
        header: "Best multiple",
        accessorFn: (r) => r.bestScore,
        copyValue: (r) =>
          outlierBadgeModel({
            score: r.bestScore,
            baselineViews: null,
            percentile: null,
            baselineWindow: null,
            ageHours: null,
            accountPosts: r.postsTracked,
          }).text,
        align: "right",
        filter: "number",
        cell: (r) => (
          <OutlierBadge
            inTable
            input={{
              score: r.bestScore,
              baselineViews: null,
              percentile: null,
              baselineWindow: null,
              ageHours: null,
              accountPosts: r.postsTracked,
            }}
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
          <span
            className="tabular-nums"
            title={r.lastPostAt ?? "No post date stored"}
          >
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
        cell: (r) =>
          busyRow === r.rowId && !r.trackedAccountId ? (
            <span className="text-primary">{progress ?? "Tracking…"}</span>
          ) : r.status === "not_tracked" ? (
            "Not tracked"
          ) : r.status === "active" ? (
            "Active"
          ) : (
            r.status
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandSeg, organizationId, brandId, brandKind, busyRow, progress],
  );

  // A fixed order that does not depend on anything tracking changes (followers, name): tracking an
  // account never moves its row. Only the person's own column sort re-orders.
  const rows = useMemo(
    () =>
      [...(accounts.data ?? [])].sort(
        (a, b) =>
          a.platform.localeCompare(b.platform) ||
          a.handle.localeCompare(b.handle),
      ),
    [accounts.data],
  );
  const untrackedOwn = rows.filter(trackableOwn);

  return (
    <>
      {showXConnections && (
        <div className="mb-4 rounded-lg border p-4">
          <div className="mb-3 flex justify-end">
            <Button variant="quiet" onClick={() => setShowXConnections(false)}>
              Close
            </Button>
          </div>
          <SocialConnectionsPanel
            brandId={brandId}
            organizationId={organizationId}
            returnUrl={`/marketing/${brandSeg}/socials/accounts`}
            onChanged={() => void invalidate()}
          />
          <CustomerAccountsPanel organizationId={organizationId} brandId={brandId} returnUrl={`/marketing/${brandSeg}/socials/accounts`} providers={["facebook", "instagram", "threads"]} />
        </div>
      )}
      <MatrxDataTable<AccountRow>
        tableId="marketing-social-accounts"
        urlState={{ id: "social-accounts" }}
        data={rows}
        columns={columns}
        getRowId={(r) => r.rowId}
        {...socialRowOpen<AccountRow>((r) => {
          // A row opens what it is: its account page when it has one, else a designed summary (never raw fields).
          const href = accountHref(brandSeg, r);
          if (href) router.push(href);
          else setSummaryRow(r);
        })}
        isLoading={accounts.isLoading}
        isFetching={accounts.isFetching}
        read={{
          status: accounts.isError
            ? "error"
            : accounts.isLoading
              ? "loading"
              : "ready",
          error: accounts.error ?? undefined,
          onRetry: () => void accounts.refetch(),
        }}
        toolbar={{
          searchPlaceholder: "Search accounts…",
          actions: (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowXConnections(true)}
              >
                Connect accounts
              </Button>
              {untrackedOwn.length > 1 ? (
                <Button
                  variant="outline"
                  icon={<UserPlus />}
                  disabled={busyRow !== null}
                  title={[
                    "Track every own account not tracked yet",
                    costText("track", untrackedOwn.length),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onClick={() => void trackAllOwn(untrackedOwn)}
                >
                  {busyRow === "bulk"
                    ? "Tracking…"
                    : `Track all own (${untrackedOwn.length})`}
                </Button>
              ) : null}
            </div>
          ),
        }}
        rowActions={(row) => [
          row.trackedAccountId
            ? {
                id: "refresh",
                icon: RefreshCw,
                label: "Refresh",
                tooltip: ["Refresh", costText("profile_page")]
                  .filter(Boolean)
                  .join(" · "),
                loading: busyRow === row.rowId,
                disabled: busyRow !== null,
                onClick: () => void refresh(row),
              }
            : trackableOwn(row)
              ? {
                  id: "track",
                  icon: UserPlus,
                  label: "Track",
                  tooltip: ["Track as Own", costText("track")]
                    .filter(Boolean)
                    .join(" · "),
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
          ...(GUIDED_CAPTURE_PLATFORMS.has(row.platform) &&
          (!row.profileId ||
            refusedRows.has(row.rowId) ||
            (row.status !== "active" && row.status !== "not_tracked"))
            ? [
                {
                  id: "capture",
                  icon: Globe,
                  label: "Capture with my browser",
                  tooltip:
                    "Can't be read the usual way? Your own browser still can. Only your organization sees it.",
                  disabled: busyRow !== null,
                  onClick: () => openCapture(captureTarget(row)),
                },
              ]
            : []),
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
      {captureNode}
      <AccountSummary
        row={summaryRow}
        onClose={() => setSummaryRow(null)}
        canTrack={
          summaryRow !== null &&
          trackableOwn(summaryRow) &&
          !summaryRow.trackedAccountId
        }
        tracking={summaryRow !== null && busyRow === summaryRow.rowId}
        onTrack={(row) => void trackOwn(row).then(() => setSummaryRow(null))}
      />
    </>
  );
}
