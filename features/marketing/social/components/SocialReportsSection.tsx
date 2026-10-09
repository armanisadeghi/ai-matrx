"use client";

/**
 * Agency roll-up on /marketing/reports: every tracked account the person can
 * read, across brands and organizations, and the recent outliers among them.
 * The access ladder holds — this list never filters by the active
 * organization; the brand column says whose account each row is.
 */

import Link from "next/link";
import { useState } from "react";

import { SegmentedControl } from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";

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
        <RowLink href={agencyAccountHref(r)}>
          {formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })}
        </RowLink>
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
  { id: "creator", label: "Creator", header: "Creator", accessorFn: (r) => r.handle, filter: "text", cell: (r) => <RowLink href={agencyAccountHref(r)}>{formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })}</RowLink> },
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

export function SocialReportsSection() {
  const agency = useAgencySocial();
  const [view, setView] = useState<"accounts" | "outliers">("accounts");
  return (
    <SectionCard title="Social" action={{ label: "Brands", href: marketingRoutes.brands() }}>
      <div className="flex flex-col gap-2 p-3">
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
    </SectionCard>
  );
}
