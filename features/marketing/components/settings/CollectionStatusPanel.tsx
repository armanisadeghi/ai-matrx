"use client";

/**
 * "Where this site's data comes from" — the connection + freshness table for
 * every collection provider bound to one site.
 *
 * WHAT IT REPLACED (2026-08-11) and why, because the old panel is a catalogue
 * of the mistakes this one must not repeat:
 *
 *  - It printed the server's `next_due_reason` into a "Next due" column, so a
 *    row whose last run FAILED explained itself with a sentence about
 *    scheduling ("scheduled DataForSEO backlink refresh is not enabled") —
 *    an answer to a question nobody asked, standing where the real failure
 *    should have been. Connection, health, and schedule are three different
 *    facts and now occupy three different columns.
 *  - It conflated "no schedule" with "not connected". Backlinks had 274 rows
 *    and a successful run an hour earlier while wearing a "not connected"
 *    chip, because the site's DataForSEO *schedule* flag was off.
 *  - It said rank tracking was "not yet built" — it shipped (WS-10) and has a
 *    workspace on this very site.
 *  - Every state it reported was a dead end: not connected with no way to
 *    connect, failed with no way to see why, stale with no way to run.
 *
 * Status is DERIVED from live evidence (bindings, the `seo.collection_run`
 * ledger, tracked rank targets) — never a stamped string.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ExternalLink, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { describeBackendFailure } from "@/lib/api/errors";
import { extractErrorMessage } from "@/utils/errors";
import {
  BackendFailureDetails,
  formatCompactDate,
} from "@/features/marketing/components/shared/MarketingUi";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  useCollectionStatus,
  type CollectionStatusRow,
} from "@/features/marketing/data/collection-status";
import { syncGscSearchPerformance } from "@/features/marketing/search-console/sync";
import { syncSiteAnalytics } from "@/features/marketing/analytics/data";
import type { MarketingSite } from "@/features/marketing/types";

export function CollectionStatusPanel({
  site,
  sitePath,
}: {
  site: MarketingSite;
  sitePath: string;
}) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<string | null>(null);

  const status = useCollectionStatus(site, sitePath);

  const rows = useMemo(() => status.data ?? [], [status.data]);
  const attention = rows.filter(
    (row) => row.health === "failing" || row.health === "not_connected",
  );

  const runNow = async (row: CollectionStatusRow) => {
    setRunning(row.key);
    try {
      if (row.key === "gsc") {
        await syncGscSearchPerformance(dispatch, site.id, site.organization_id);
      } else if (row.key === "ga4") {
        await syncSiteAnalytics(dispatch, site.id, site.organization_id);
      } else {
        return;
      }
      toast.success(`${row.label} refreshed`);
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.site(site.id),
      });
    } catch (error) {
      const explanation = describeBackendFailure(error);
      toast.error(`${row.label} refresh failed`, {
        description: explanation.headline,
      });
    } finally {
      setRunning(null);
    }
  };

  const columns: MatrxColumnDef<CollectionStatusRow>[] = [
    {
      id: "label",
      accessorKey: "label",
      header: "Source",
      cell: (row) => {
        const Icon = row.spec?.icon;
        const body = (
          <span className="flex items-center gap-1.5">
            {Icon ? (
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : null}
            <span className="font-medium text-foreground">{row.label}</span>
          </span>
        );
        return row.data ? (
          <Link
            href={row.data.href}
            className="hover:text-primary hover:underline"
          >
            {body}
          </Link>
        ) : (
          body
        );
      },
    },
    {
      id: "health",
      accessorKey: "healthLabel",
      header: "Status",
      filter: "select",
      cell: (row) => (
        <Badge
          variant={
            row.health === "failing"
              ? "destructive"
              : row.health === "connected"
                ? "success"
                : "outline"
          }
          className={cn(
            "text-[10px]",
            row.health === "not_connected" && "border-warning/50 text-warning",
          )}
        >
          {row.healthLabel}
        </Badge>
      ),
    },
    {
      id: "lastRunAt",
      accessorFn: (row) => row.lastRunAt ?? "",
      header: "Last run",
      cell: (row) => (
        <span
          className={cn(
            "text-muted-foreground",
            row.lastRunStatus === "failed" && "text-destructive",
          )}
        >
          {row.lastRunAt ? formatCompactDate(row.lastRunAt) : "never"}
        </span>
      ),
    },
    {
      id: "lastSuccessAt",
      accessorFn: (row) => row.lastSuccessAt ?? "",
      header: "Last success",
      cell: (row) => (
        <span className="text-muted-foreground">
          {row.lastSuccessAt ? formatCompactDate(row.lastSuccessAt) : "never"}
        </span>
      ),
    },
    {
      id: "rowCount",
      accessorFn: (row) => row.rowCount ?? 0,
      header: "Collected",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">
          {row.rowCount === null
            ? "—"
            : Intl.NumberFormat().format(row.rowCount)}
        </span>
      ),
    },
    {
      id: "schedule",
      accessorKey: "scheduleLabel",
      header: "Refreshes",
      filter: "select",
      cell: (row) => (
        <span className="text-muted-foreground">{row.scheduleLabel}</span>
      ),
    },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Where this site&apos;s data comes from
          </h2>
          {attention.length ? (
            <Badge variant="outline" className="border-warning/50 text-warning">
              {attention.length} need
              {attention.length === 1 ? "s" : ""} attention
            </Badge>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          disabled={status.isFetching}
          onClick={() => void status.refetch()}
          aria-label="Refresh collection status"
        >
          {status.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>
      <div className="p-2">
        {status.isError ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {extractErrorMessage(status.error)}
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => void status.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : null}
        <MatrxDataTable
          urlState={{ id: "collection-status" }}
          data={rows}
          columns={columns}
          getRowId={(row) => row.key}
          isLoading={status.isLoading}
          isFetching={status.isFetching}
          toolbar={{ searchPlaceholder: "Search sources" }}
          detail={{
            title: (row) => row.label,
            description: (row) => row.what,
            render: (row) => <ProviderDetail row={row} />,
          }}
          copy={{
            label: "Data source",
            listLabel: "Site data sources",
            location: "Site settings — data sources",
            rowKind: "web-site-data-source",
            listKind: "web-site-data-sources",
            humanRow: (row) =>
              [
                row.label,
                row.healthLabel,
                row.healthDetail,
                `Last run: ${row.lastRunAt ?? "never"}`,
                `Last success: ${row.lastSuccessAt ?? "never"}`,
                `Collected: ${row.rowCount ?? "—"} ${row.rowUnit}`,
                `Refreshes: ${row.scheduleLabel}`,
              ].join(" · "),
            rowAttributes: (row) => ({
              site_id: site.id,
              provider: row.key,
              health: row.health,
            }),
          }}
          rowActions={(row) => (
            <div className="flex items-center justify-end gap-1">
              {row.runnable ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-1.5 text-[11px]"
                  disabled={running !== null}
                  aria-label={`Run ${row.label} now`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void runNow(row);
                  }}
                >
                  {running === row.key ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Run now
                </Button>
              ) : null}
              {(row.health === "not_connected" || row.health === "failing") &&
              row.fix ? (
                <Button
                  asChild
                  size="sm"
                  variant={row.health === "failing" ? "outline" : "default"}
                  className="h-6 px-1.5 text-[11px]"
                >
                  <Link
                    href={row.fix.href}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {row.health === "failing" ? "Check setup" : row.fix.label}
                  </Link>
                </Button>
              ) : null}
              {row.data ? (
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                >
                  <Link
                    href={row.data.href}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`${row.data.label} for ${row.label}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              ) : null}
            </div>
          )}
          emptyState={{
            title: "No data sources reported",
            description:
              "This site has no collection providers yet. Connect one from the integrations page.",
          }}
        />
      </div>
    </section>
  );
}

function ProviderDetail({ row }: { row: CollectionStatusRow }) {
  return (
    <div className="space-y-3 p-3 text-xs">
      {/* `what` is already the panel's description — repeating it here is how
          a detail view turns into a wall of the same sentence twice. */}
      <div className="rounded-md border border-border p-2">
        <p className="font-medium text-foreground">{row.healthLabel}</p>
        <p className="mt-0.5 text-muted-foreground">{row.healthDetail}</p>
      </div>
      {row.failure ? (
        <BackendFailureDetails
          failure={row.failure}
          label="Why the last attempt failed"
        />
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {(
          [
            [
              "Last run",
              row.lastRunAt ? formatCompactDate(row.lastRunAt) : "never",
            ],
            [
              "Last success",
              row.lastSuccessAt
                ? formatCompactDate(row.lastSuccessAt)
                : "never",
            ],
            [
              "Collected",
              row.rowCount === null
                ? "—"
                : `${Intl.NumberFormat().format(row.rowCount)} ${row.rowUnit}`,
            ],
            ["Refreshes", `${row.scheduleLabel} — ${row.scheduleDetail}`],
            ...(row.trackedTargets !== null
              ? ([["Keywords tracked", String(row.trackedTargets)]] as Array<
                  [string, string]
                >)
              : []),
          ] as Array<[string, string]>
        ).map(([label, value]) => (
          <div key={label} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        {row.fix ? (
          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
            <Link href={row.fix.href}>{row.fix.label}</Link>
          </Button>
        ) : null}
        {row.data ? (
          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
            <Link href={row.data.href}>{row.data.label}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
