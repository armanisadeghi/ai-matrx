"use client";

/**
 * Agency roll-up on /marketing/reports: every tracked account the person can
 * read, across brands and organizations, and the recent outliers among them.
 * The access ladder holds — this list never filters by the active
 * organization; the brand column says whose account each row is.
 */

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import { SegmentedControl } from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { useRouter } from "next/navigation";
import { socialRowOpen } from "../row-open";
import type { MatrxColumnDef, MatrxDataTableMobileCardControls } from "@ai-matrx/design-system/data-table/types";
import { useSurfaceRuntimeRegistration } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { xmlElement, xmlList } from "@ai-matrx/chat/surfaces/runtime/context-bundle";
import { SOCIAL_ROLLUP_SURFACE_NAME, createSocialRollupScope } from "@/features/surfaces/manifests/marketing-social-rollup.manifest";

import { useAgencySocial } from "../hooks";
import { relativeAge } from "../mappers";
import { formatCompact, formatMultiplier } from "../outlier";
import type { AgencyAccountRow, AgencyOutlierRow } from "../service";
import { SOCIAL_PLATFORM_LABELS, TRACKED_ROLE_LABELS, isSocialPlatform } from "../types";
import { PlatformMark } from "./PlatformMark";
import { agencyAccountHref, agencyBrandHref } from "../agencyLinks";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";

function RowLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className="min-w-0 truncate underline-offset-2 hover:underline" data-clickable="">
      {children}
    </Link>
  ) : (
    <>{children}</>
  );
}

/**
 * An account with no brand has no page of ours to open, so its name opens the profile itself
 * (a new tab, marked) - never plain text.
 */
function AccountLink({ row, children }: { row: { brandId: string | null; platform: string; profileId: string | null; profileUrl: string | null }; children: React.ReactNode }) {
  const href = agencyAccountHref(row);
  if (href) return <RowLink href={href}>{children}</RowLink>;
  if (!row.profileUrl) return <>{children}</>;
  return (
    <a href={row.profileUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-w-0 items-center gap-1 underline-offset-2 hover:underline" data-clickable="">
      <span className="truncate">{children}</span>
      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Opens in a new tab" />
    </a>
  );
}

function platformLabel(p: string): string {
  return isSocialPlatform(p) ? SOCIAL_PLATFORM_LABELS[p] : p;
}

const ACCOUNT_COLUMNS: MatrxColumnDef<AgencyAccountRow>[] = [
  {
    id: "brand",
    label: "Brand",
    header: "Brand",
    accessorFn: (r) => r.brandName,
    filter: "select",
    cell: (r) => <RowLink href={agencyBrandHref(r)}>{r.brandName}</RowLink>,
  },
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
        <AccountLink row={r}>
          {formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })}
        </AccountLink>
      </span>
    ),
  },
  {
    id: "platform",
    label: "Platform",
    header: "Platform",
    accessorFn: (r) => r.platform,
    copyValue: (r) => platformLabel(r.platform),
    filter: "select",
    filterOptions: Object.entries(SOCIAL_PLATFORM_LABELS).map(([value, label]) => ({ value, label })),
    cell: (r) => platformLabel(r.platform),
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
    id: "refreshed",
    label: "Last refreshed",
    header: "Refreshed",
    accessorFn: (r) => r.lastRefreshedAt,
    filter: "date",
    cell: (r) => relativeAge(r.lastRefreshedAt),
  },
];

const OUTLIER_COLUMNS: MatrxColumnDef<AgencyOutlierRow>[] = [
  {
    id: "brand",
    label: "Brand",
    header: "Brand",
    accessorFn: (r) => r.brandName,
    filter: "select",
    cell: (r) => <RowLink href={agencyBrandHref(r)}>{r.brandName}</RowLink>,
  },
  {
    id: "post",
    label: "Post",
    header: "Post",
    accessorFn: (r) => r.hookLine,
    filter: "text",
    minWidth: 240,
    cell: (r) => (
      <a href={r.url} target="_blank" rel="noreferrer noopener" className="block max-w-[28rem] truncate underline-offset-2 hover:underline">
        {r.hookLine || "No caption"}
      </a>
    ),
  },
  { id: "creator", label: "Creator", header: "Creator", accessorFn: (r) => r.handle, filter: "text", cell: (r) => <AccountLink row={r}>{formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })}</AccountLink> },
  {
    id: "platform",
    label: "Platform",
    header: "Platform",
    accessorFn: (r) => r.platform,
    copyValue: (r) => platformLabel(r.platform),
    filter: "select",
    filterOptions: Object.entries(SOCIAL_PLATFORM_LABELS).map(([value, label]) => ({ value, label })),
    cell: (r) => platformLabel(r.platform),
  },
  {
    id: "multiple",
    label: "Multiple",
    header: "Multiple",
    accessorFn: (r) => r.score,
    copyValue: (r) => formatMultiplier(r.score),
    align: "right",
    filter: "number",
    cell: (r) => <span className="tabular-nums">{formatMultiplier(r.score)}</span>,
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
  { id: "posted", label: "Posted", header: "Posted", accessorFn: (r) => r.postedAt, filter: "date", cell: (r) => relativeAge(r.postedAt) },
];

function stat(label: string, value: ReactNode) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function RollupAccountCard({ row: r, controls }: { row: AgencyAccountRow; controls: MatrxDataTableMobileCardControls }) {
  return (
    <div className="flex flex-col gap-1.5 p-3">
      <div className="min-w-0 text-sm">{controls.renderCell("account")}</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {stat("Brand", r.brandName)}
        {stat("Followers", formatCompact(r.followers))}
        {stat("Refreshed", relativeAge(r.lastRefreshedAt))}
        <span className="text-xs text-muted-foreground">{TRACKED_ROLE_LABELS[r.role]}</span>
      </div>
    </div>
  );
}

function RollupOutlierCard({ row: r, controls }: { row: AgencyOutlierRow; controls: MatrxDataTableMobileCardControls }) {
  return (
    <div className="flex flex-col gap-1.5 p-3">
      <div className="min-w-0 text-sm">{controls.renderCell("post")}</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {stat("Brand", r.brandName)}
        {stat("Multiple", formatMultiplier(r.score))}
        {stat("Views", formatCompact(r.views))}
        {stat("Posted", relativeAge(r.postedAt))}
      </div>
    </div>
  );
}

export function SocialReportsSection() {
  const agency = useAgencySocial();
  const router = useRouter();
  const [view, setView] = useState<"accounts" | "outliers">("accounts");
  // The agent surface: built from the rows already on screen (never a fetch).
  const surfaceScope = () => {
    if (agency.isError) {
      return createSocialRollupScope({ rollup_loaded: false, view, load_error: agency.error instanceof Error ? agency.error.message : "Could not read the social roll-up." });
    }
    if (agency.isLoading || !agency.data) return createSocialRollupScope({ rollup_loaded: false, view });
    const accounts = [...agency.data.accounts].sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1));
    const outliers = [...agency.data.outliers].sort((a, b) => b.score - a.score);
    return createSocialRollupScope({
      rollup_loaded: true,
      view,
      account_count: accounts.length,
      brand_count: new Set(accounts.map((a) => a.brandId).filter(Boolean)).size,
      accounts_by_role: Object.fromEntries(Object.keys(TRACKED_ROLE_LABELS).map((role) => [role, accounts.filter((a) => a.role === role).length])),
      account_list: xmlList(
        "accounts",
        accounts,
        (a) =>
          xmlElement("account", {
            brand: a.brandName,
            platform: a.platform,
            handle: a.handle,
            role: a.role,
            followers: a.followers,
            has_page: agencyAccountHref(a) !== null,
          }),
        { maxRows: 40, attrs: { total: accounts.length } },
      ),
      accounts: accounts.map((a) => ({
        tracked_account_id: a.trackedAccountId,
        brand_id: a.brandId,
        brand_name: a.brandName,
        profile_id: a.profileId,
        platform: a.platform,
        handle: a.handle,
        role: a.role,
        followers: a.followers,
        last_refreshed_at: a.lastRefreshedAt,
      })),
      outlier_count: outliers.length,
      outlier_list: xmlList(
        "outliers",
        outliers,
        (o) => xmlElement("outlier", { brand: o.brandName, platform: o.platform, handle: o.handle, multiple: o.score, views: o.views, posted: o.postedAt }),
        { maxRows: 25, attrs: { total: outliers.length } },
      ),
    });
  };
  useSurfaceRuntimeRegistration({ surfaceName: SOCIAL_ROLLUP_SURFACE_NAME, getScope: surfaceScope, isEditable: false });

  return (
    <div>
      <div className="flex flex-col gap-2">
        <SegmentedControl
          aria-label="Social view"
          value={view}
          onValueChange={setView}
          data={[
            { value: "accounts", label: "Tracked accounts" },
            { value: "outliers", label: "Recent outliers" },
          ]}
        />
        {view === "accounts" ? (
          <MatrxDataTable<AgencyAccountRow>
            tableId="marketing-reports-social-accounts"
            data={agency.data?.accounts ?? []}
            columns={ACCOUNT_COLUMNS}
            getRowId={(r) => r.trackedAccountId}
            {...socialRowOpen<AgencyAccountRow>((r) => {
              const href = agencyAccountHref(r) ?? agencyBrandHref(r);
              if (href) router.push(href);
              else if (r.profileUrl) window.open(r.profileUrl, "_blank", "noopener,noreferrer");
            })}
            mobileCardsBreakpoint="md"
            mobileCards={(r, _i, controls) => <RollupAccountCard row={r} controls={controls} />}
            isLoading={agency.isLoading}
            read={{
              status: agency.isError ? "error" : agency.isLoading ? "loading" : "ready",
              error: agency.error ?? undefined,
              onRetry: () => void agency.refetch(),
            }}
            toolbar={{ searchPlaceholder: "Search accounts…" }}
            defaultSort={{ id: "followers", direction: "desc" }}
            emptyState={{ title: "No tracked accounts", description: "Track one from a brand's Socials" }}
          />
        ) : (
          <MatrxDataTable<AgencyOutlierRow>
            tableId="marketing-reports-social-outliers"
            data={agency.data?.outliers ?? []}
            columns={OUTLIER_COLUMNS}
            getRowId={(r) => r.postId}
            {...socialRowOpen<AgencyOutlierRow>((r) => {
              window.open(r.url, "_blank", "noopener,noreferrer");
            })}
            mobileCardsBreakpoint="md"
            mobileCards={(r, _i, controls) => <RollupOutlierCard row={r} controls={controls} />}
            isLoading={agency.isLoading}
            read={{
              status: agency.isError ? "error" : agency.isLoading ? "loading" : "ready",
              error: agency.error ?? undefined,
              onRetry: () => void agency.refetch(),
            }}
            toolbar={{ searchPlaceholder: "Search outliers…" }}
            defaultSort={{ id: "multiple", direction: "desc" }}
            emptyState={{ title: "No outliers in 30 days", description: "3x and up" }}
          />
        )}
      </div>
    </div>
  );
}
