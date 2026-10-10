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
import { useRouter, useSearchParams } from "next/navigation";
import { useSurfaceRuntimeRegistration, useSurfaceWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { parseCreateAccounts, parseUpdateAccounts } from "../agent-writes";
import { useSocialSpend } from "../cost";
import { countOf, withCostOn } from "../social-actions";
import { xmlElement, xmlList } from "@ai-matrx/chat/surfaces/runtime/context-bundle";
import { createSocialAccountsScope, SOCIAL_ACCOUNTS_SURFACE_NAME } from "@/features/surfaces/manifests/marketing-social-accounts.manifest";
import { useMemo, useState, type ReactNode } from "react";
import { Globe, Link2, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";

import {
  Badge,
  Button,
  Select,
  type SelectOption,
} from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef, MatrxDataTableMobileCardControls } from "@ai-matrx/design-system/data-table/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { useRefusedRead } from "../gated/RefusedReadOffer";
import { GUIDED_CAPTURE_PLATFORMS } from "../gated/guidedJob";

import { useAccountRows, useInvalidateSocial } from "../hooks";
import { CONNECTION_STATE_LABELS, CONNECTION_STATE_TONES } from "../connection-state";
import { useConnectionStates } from "../useConnectionStates";
import {
  accountLabels,
  accountName,
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
import { accountHref } from "../account-href";
import { brandAccountHref } from "../property-account-href";
import { AccountSummary } from "./AccountSummary";
import { OutlierBadge } from "./OutlierBadge";
import { PlatformMark } from "./PlatformMark";
import { ConnectAccountMenu, useStartConnection } from "./ConnectAccountMenu";
import { CONNECTION_RETURN_PARAMS, ManageConnectionsDialog } from "./ManageConnectionsDialog";
import { useSocials } from "./SocialsContext";
import { trackableOwn, useTrackOwn } from "./useTrackOwn";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";

const ROLE_OPTIONS: SelectOption<TrackedRole>[] = TRACKED_ROLES.map((r) => ({
  value: r,
  label: TRACKED_ROLE_LABELS[r],
}));

export { accountHref };

/** A phone's row: who it is and the numbers that matter, with the table's own actions. */
function AccountCard({
  row: r,
  controls,
}: {
  row: AccountRow;
  controls: MatrxDataTableMobileCardControls;
}) {
  const stat = (label: string, value: ReactNode) => (
    <span className="flex items-baseline gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums text-foreground">{value}</span>
    </span>
  );
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="min-w-0">{controls.renderCell("account")}</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {stat("Followers", formatCompact(r.followers))}
        {stat("30d", formatGrowth(r.growth))}
        {stat("Posts", r.postsTracked)}
        {stat("Best", <OutlierBadge inTable input={{ score: r.bestScore, baselineViews: null, percentile: null, baselineWindow: null, ageHours: null, accountPosts: r.postsTracked }} />)}
        {stat("Last post", lastPostLabel(r.lastPostAt, r.postsTracked))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* One chip, the table's own Status: tracking first, then a non-own role, then the connection. */}
        <div className="min-w-0">{controls.renderCell("status")}</div>
        <div className="ml-auto shrink-0">{controls.actions}</div>
      </div>
    </div>
  );
}

export function AccountsTab() {
  const { brandId, brandSeg, organizationId, openTrack, canEdit } = useSocials();
  const brand = useMarketingBrand();
  const brandKind = brand.kind;
  const router = useRouter();
  const searchParams = useSearchParams();
  // A provider's consent sends the person back here: its follow-up steps (pick the account) live in the hub.
  const [manageOpen, setManageOpen] = useState(() => CONNECTION_RETURN_PARAMS.some((k) => searchParams?.has(k)));
  const [summaryRow, setSummaryRow] = useState<AccountRow | null>(null);
  const accounts = useAccountRows(organizationId, brandId);
  const connections = useConnectionStates(organizationId);
  const invalidate = useInvalidateSocial();
  const {
    busyRow,
    progress,
    setBusyRow,
    trackOwn,
    trackOwnRow,
    trackAllOwn,
    costText,
    confirmSpend,
  } = useTrackOwn(organizationId, brandId);
  const { agentCostText } = useSocialSpend(organizationId);

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
      title: `Refresh ${accountName(row)}?`,
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
      title: `Stop tracking ${accountName(row)}?`,
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

  /** An own account attached through a connection, not yet on this brand: link it (property + brand). */
  async function addToBrand(row: AccountRow) {
    if (!row.profileId) return;
    setBusyRow(row.rowId);
    try {
      await trackAccount(
        { profileId: row.profileId, role: "own", brandId, pages: 0, allowEmpty: true },
        { organizationId },
      );
      await invalidate();
      toast.success(`${accountName(row)} added to ${brand.name}`);
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't add the account to this brand"));
    } finally {
      setBusyRow(null);
    }
  }

  const startConnect = useStartConnection(organizationId, brandSeg, () => setManageOpen(true));

  async function changeRole(row: AccountRow, role: TrackedRole) {
    if (!row.trackedAccountId || role === row.role) return;
    try {
      await setTrackedRole(row.trackedAccountId, role);
      await invalidate();
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't change the role"));
    }
  }

  /** An own account's connection state (competitors and inspiration are read-only follows: no connection). */
  const connectionOf = (r: AccountRow) => {
    if (r.role !== "own") return null;
    const c = connections.of(r.platform);
    return c ? { ...c, label: CONNECTION_STATE_LABELS[c.state], tone: CONNECTION_STATE_TONES[c.state] } : null;
  };

  const columns = useMemo<MatrxColumnDef<AccountRow>[]>(
    () => [
      {
        id: "account",
        width: 170,
        label: "Account",
        header: "Account",
        accessorFn: (r) =>
          `${r.displayName} ${formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })}`,
        copyValue: (r) =>
          `${r.displayName} (${formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })})`,
        filter: "text",
        minWidth: 160,
        cell: (r) => {
          const href = brandAccountHref(brandSeg, r);
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
                      canEdit={canEdit}
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
            <Link href={href} className="block min-w-0 max-md:flex max-md:min-h-11 max-md:items-center" data-clickable="">
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
        width: 124,
        hidden: true, // the Status column names a non-own role; the column stays for filtering and editing
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
              aria-label={`Role for ${accountName(r)}`}
              value={r.role}
              options={ROLE_OPTIONS}
              onValueChange={(v) => void changeRole(r, v)}
            />
          ) : (
            TRACKED_ROLE_LABELS[r.role]
          ),
      },
      {
        id: "connection",
        width: 108,
        hidden: true, // shown beside the account name; the column stays for filtering
        label: "Connection",
        header: "Connection",
        accessorFn: (r) => connectionOf(r)?.label ?? "",
        filter: "select",
        filterOptions: [...new Set(Object.values(CONNECTION_STATE_LABELS))].map((label) => ({ value: label, label })),
        cell: (r) => {
          const c = connectionOf(r);
          return c ? <Badge tone={c.tone}>{c.label}</Badge> : null;
        },
      },
      {
        id: "followers",
        width: 72,
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
        width: 64,
        label: "30d growth",
        header: "30d",
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
        width: 60,
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
        width: 72,
        label: "Best multiple",
        header: "Best",
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
        width: 84,
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
        id: "status",
        width: 100,
        label: "Status",
        header: "Status",
        accessorKey: "status",
        filter: "select",
        // One badge says what matters most: tracking first, then a non-own role, then where the connection stands.
        cell: (r) => {
          if (busyRow === r.rowId && !r.trackedAccountId) return <span className="text-primary">{progress ?? "Tracking…"}</span>;
          if (r.status === "not_tracked") return <Badge tone="warning">Not tracked</Badge>;
          if (r.status !== "active") return r.status;
          if (r.role !== "own") return <Badge tone="neutral">{TRACKED_ROLE_LABELS[r.role]}</Badge>;
          const c = connectionOf(r);
          return c ? <Badge tone={c.tone}>{c.label}</Badge> : "Active";
        },
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
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandSeg, organizationId, brandId, brandKind, busyRow, progress, connections.data, canEdit],
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

  // The agent surface: built from the rows already on screen (never a fetch).
  const surfaceScope = () =>
    createSocialAccountsScope(
      accounts.isError
        ? {
            accounts_loaded: false,
            load_error: socialErrorMessage(accounts.error, "Could not read the accounts."),
            brand_id: brandId,
            brand_name: brand.name,
            brand_kind: brandKind,
          }
        : accounts.isLoading
          ? ({ accounts_loaded: false, brand_id: brandId, brand_name: brand.name, brand_kind: brandKind } as never)
          : {
              accounts_loaded: true,
              brand_id: brandId,
              brand_name: brand.name,
              brand_kind: brandKind,
              account_count: rows.length,
              accounts_by_role: Object.fromEntries(
                TRACKED_ROLES.map((r) => [r, rows.filter((x) => x.role === r).length]),
              ),
              untracked_own_count: untrackedOwn.length,
              account_list: xmlList(
                "accounts",
                rows,
                (r) =>
                  xmlElement("account", {
                    id: r.profileId ?? r.rowId,
                    platform: r.platform,
                    handle: r.handle,
                    name: r.displayName,
                    role: r.role,
                    status: r.status,
                    followers: r.followers,
                    growth: r.growth === null ? null : formatGrowth(r.growth),
                    posts: r.postsTracked,
                    best_multiple: r.bestScore,
                    has_page: accountHref(brandSeg, r) !== null,
                  }),
                { maxRows: 40, attrs: { brand: brand.name, total: rows.length } },
              ),
              accounts: rows.map((r) => ({
                row_id: r.rowId,
                profile_id: r.profileId,
                platform: r.platform,
                handle: r.handle,
                display_name: r.displayName,
                role: r.role,
                status: r.status,
                followers: r.followers,
                growth: r.growth,
                posts_tracked: r.postsTracked,
                best_multiple: r.bestScore,
                last_post_at: r.lastPostAt,
                last_refreshed_at: r.lastRefreshedAt,
                has_page: accountHref(brandSeg, r) !== null,
              })),
            },
    );
  useSurfaceRuntimeRegistration({ surfaceName: SOCIAL_ACCOUNTS_SURFACE_NAME, getScope: surfaceScope, isEditable: true });

  // Agent writes: Track an account (the Track dialog's handle-or-link save), Track as Own, Stop
  // tracking, role change and Refresh — the same saves as the buttons, each approved on a card
  // first; anything that spends points names them before it runs (confirmSpend).
  const accountWrites = collectionWriteHandlers(
      {
        plural: "accounts",
        singular: "account",
        create: {
          parse: (value) => parseCreateAccounts(value),
          run: async (plan) => {
            const result = await trackAccount(
              { handleOrUrl: plan.handleOrUrl, platform: plan.platform, role: plan.role, brandId, pages: 1 },
              { organizationId },
            );
            await invalidate();
            return { id: result.tracked_account_id, name: result.created ? plan.label : `${plan.label} (already tracked)` };
          },
          nameOf: (plan) => plan.label,
          refusalFor: (err, savedSoFar) =>
            err instanceof Error && err.message.startsWith("The person declined") && savedSoFar === 0 ? err.message : undefined,
        },
        update: {
          parse: (value) => parseUpdateAccounts(value, rows),
          run: async (plan) => {
            const { row } = plan;
            if (plan.tracked === false && row.trackedAccountId) await untrackAccount(row.trackedAccountId, { organizationId });
            if (plan.tracked === true) {
              if ((await trackOwnRow(row)) !== "ok") throw new Error(`${plan.label} could not be tracked.`);
            }
            if (plan.role && row.trackedAccountId) await setTrackedRole(row.trackedAccountId, plan.role);
            if (plan.refresh && row.profileId) {
              await refreshProfile(row.profileId, { pages: 1 }, { organizationId });
            }
            await invalidate();
            return { id: row.rowId, name: plan.label };
          },
          nameOf: (plan) => plan.label,
          changedOf: (plan) => plan.changed,
          refusalFor: (err, savedSoFar) =>
            err instanceof Error && err.message.startsWith("The person declined") && savedSoFar === 0 ? err.message : undefined,
        },
      },
      refuseSurfaceWrite,
    );
  // The approval card names the points, however small: one track per account, one page per refresh.
  const flagged = (key: string) => (value: unknown) =>
    countOf(value, (item) => !!item && typeof item === "object" && (item as Record<string, unknown>)[key] === true);
  const accountCost = withCostOn(() => accountWrites);
  useSurfaceWriteHandlers(SOCIAL_ACCOUNTS_SURFACE_NAME, {
    ...accountWrites,
    ...accountCost("create_accounts", (value) => agentCostText("track", countOf(value))),
    ...accountCost("update_accounts", (value) =>
      [agentCostText("track", flagged("tracked")(value)), agentCostText("profile_page", flagged("refresh")(value))]
        .filter(Boolean)
        .join(" + ") || null,
    ),
  });

  return (
    <>
      <ManageConnectionsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        organizationId={organizationId}
        brandId={brandId}
        brandSeg={brandSeg}
        onChanged={() => void invalidate()}
      />
      <MatrxDataTable<AccountRow>
        tableId="marketing-social-accounts"
        urlState={{ id: "social-accounts" }}
        data={rows}
        columns={columns}
        getRowId={(r) => r.rowId}
        {...socialRowOpen<AccountRow>((r) => {
          // A row opens what it is: its account page when it has one, else a designed summary (never raw fields).
          const href = brandAccountHref(brandSeg, r);
          if (href) router.push(href);
          else setSummaryRow(r);
        })}
        mobileCardsBreakpoint="md"
        mobileCards={(r, _i, controls) => <AccountCard row={r} controls={controls} />}
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
          actions: !canEdit ? undefined : (
            <div className="flex items-center gap-2">
              <ConnectAccountMenu
                organizationId={organizationId}
                start={startConnect}
                onManage={() => setManageOpen(true)}
              />
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
        rowActions={(row) => !canEdit ? [] : [
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
          ...(row.unassigned && row.profileId
            ? [
                {
                  id: "add-to-brand",
                  icon: Plus,
                  label: "Add to brand",
                  tooltip: `Show this account on ${brand.name}`,
                  loading: busyRow === row.rowId,
                  disabled: busyRow !== null,
                  onClick: () => void addToBrand(row),
                },
              ]
            : []),
          ...(() => {
            const c = row.role === "own" ? connections.of(row.platform) : null;
            if (!c || !c.canConnect || c.state === "connected") return [];
            const reconnect = c.state === "reconnect";
            return [
              {
                id: reconnect ? "reconnect" : "connect",
                icon: Link2,
                label: reconnect ? "Reconnect" : "Connect",
                tooltip: reconnect ? "Sign in again to restore private stats" : "Connect for private stats",
                disabled: busyRow !== null,
                onClick: () => startConnect(c),
              },
            ];
          })(),
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
          action: canEdit ? (
            <Button variant="primary" icon={<Plus />} onClick={openTrack}>
              Track account
            </Button>
          ) : undefined,
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
