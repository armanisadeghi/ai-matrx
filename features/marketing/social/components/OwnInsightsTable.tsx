"use client";

/**
 * KPIs "Own channel": the private figures of every own account the brand tracks, one row each, read by
 * the shared insights reader (the account page uses the same one). A figure the provider never sent
 * reads "Not available", never 0. Each row also says where its connection stands.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { Badge } from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { CONNECTION_STATE_LABELS, CONNECTION_STATE_TONES } from "../connection-state";
import { INSIGHT_METRICS, insightText, type InsightMetricId } from "../insights";
import { brandAccountHref } from "../property-account-href";
import { formatCompact } from "../outlier";
import { accountName, postedLabel, postedTitle } from "../mappers";
import type { AccountRow } from "../types";
import { useConnectionStates } from "../useConnectionStates";
import { useOwnInsights } from "../useOwnInsights";
import { PlatformMark, platformLabel } from "./PlatformMark";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";
import { socialRowOpen } from "../row-open";
import { TopOwnPosts } from "./TopOwnPosts";

export function OwnInsightsTable({
  accounts,
  organizationId,
  brandSeg,
  loading,
}: {
  accounts: readonly AccountRow[];
  organizationId: string;
  brandSeg: string;
  loading: boolean;
}) {
  const router = useRouter();
  const own = useMemo(
    () => accounts.filter((a) => a.role === "own" && a.trackedAccountId),
    [accounts],
  );
  const ids = useMemo(() => own.map((a) => a.trackedAccountId as string), [own]);
  const insights = useOwnInsights(ids);
  const connections = useConnectionStates(organizationId);

  // Only the figures some account's provider actually sent get a column.
  const metrics = INSIGHT_METRICS.filter((m) =>
    [...insights.summaries.values()].some((s) => s.values[m.id] !== null),
  );

  const columns = useMemo<MatrxColumnDef<AccountRow>[]>(
    () => [
      {
        id: "account",
        label: "Account",
        header: "Account",
        accessorFn: (r) => `${r.displayName} ${r.handle}`,
        filter: "text",
        minWidth: 200,
        cell: (r) => {
          const href = brandAccountHref(brandSeg, r);
          const body = (
            <span className="flex min-w-0 items-center gap-2">
              <PlatformMark platform={r.platform} size={20} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-medium text-foreground">{accountName(r)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {platformLabel(r.platform)} · {formatSocialHandle({ platform: r.platform, handle: r.handle, url: r.profileUrl })}
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
        id: "connection",
        label: "Connection",
        header: "Connection",
        accessorFn: (r) => {
          const c = connections.of(r.platform);
          return c ? CONNECTION_STATE_LABELS[c.state] : "";
        },
        filter: "select",
        filterOptions: [...new Set(Object.values(CONNECTION_STATE_LABELS))].map((label) => ({ value: label, label })),
        cell: (r) => {
          const c = connections.of(r.platform);
          return c ? <Badge tone={CONNECTION_STATE_TONES[c.state]}>{CONNECTION_STATE_LABELS[c.state]}</Badge> : null;
        },
      },
      ...metrics.map<MatrxColumnDef<AccountRow>>((m) => ({
        id: m.id,
        label: m.label,
        header: m.label,
        align: "right",
        filter: "number",
        accessorFn: (r) => insights.summaries.get(r.trackedAccountId as string)?.values[m.id as InsightMetricId] ?? null,
        copyValue: (r) =>
          insightText(insights.summaries.get(r.trackedAccountId as string)?.values[m.id as InsightMetricId] ?? null, formatCompact),
        cell: (r) => {
          const v = insights.summaries.get(r.trackedAccountId as string)?.values[m.id as InsightMetricId] ?? null;
          return v === null ? (
            <span className="text-muted-foreground">Not available</span>
          ) : (
            <span className="tabular-nums">{formatCompact(v)}</span>
          );
        },
      })),
      {
        id: "updated",
        label: "Last 30 days to",
        header: "Through",
        filter: "date",
        accessorFn: (r) => insights.summaries.get(r.trackedAccountId as string)?.latestDate ?? null,
        cell: (r) => {
          const d = insights.summaries.get(r.trackedAccountId as string)?.latestDate ?? null;
          return d ? <span title={postedTitle(d)}>{postedLabel(d)}</span> : <span className="text-muted-foreground">Not available</span>;
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandSeg, metrics.map((m) => m.id).join(","), insights.summaries, connections.data],
  );

  return (
    <div className="flex flex-col gap-4">
    <MatrxDataTable<AccountRow>
      {...socialRowOpen<AccountRow>((r) => {
        const href = brandAccountHref(brandSeg, r);
        if (href) router.push(href);
      })}
      tableId="marketing-social-own-insights"
      data={own as AccountRow[]}
      columns={columns}
      getRowId={(r) => r.rowId}
      isLoading={loading || insights.isLoading}
      read={{
        status: insights.isError ? "error" : loading || insights.isLoading ? "loading" : "ready",
        error: insights.error ?? undefined,
        onRetry: () => void insights.refetch(),
      }}
      toolbar={{ searchPlaceholder: "Search accounts…" }}
      emptyState={{ title: "No own accounts yet", description: "Connect one on Accounts" }}
    />
    {own.map((a) => (
      <TopOwnPosts key={a.rowId} trackedAccountId={a.trackedAccountId as string} account={own.length > 1 ? accountName(a) : undefined} />
    ))}
    </div>
  );
}
