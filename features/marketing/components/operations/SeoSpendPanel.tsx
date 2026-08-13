"use client";

/**
 * SEO provider spend rollup panel (M-9 / WS-7 UI tranche) — the third
 * `/marketing/cost` mode, alongside "By site" / "By client". Reads
 * `GET /seo/spend/summary`: this-month + last-month provider breakdown
 * (spent vs the org/provider monthly ceiling, % used), a 30-day daily
 * spend chart, and any recent `seo_budget_exceeded` rejections so a
 * budget-blocked run is visible, not silent.
 */

import { AlertTriangle, CircleDollarSign, Loader2 } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/features/marketing/components/shared/MarketingUi";
import { SeoSpendChart } from "@/features/marketing/components/operations/SeoSpendChart";
import { formatRuntimeCost } from "@/features/marketing/data/operations-format";
import {
  useSeoSpendSummary,
  type SeoBudgetRejectionRow,
  type SeoProviderSpendRow,
} from "@/features/marketing/data/spend";

function ProviderRow({ row }: { row: SeoProviderSpendRow }) {
  const pct = Math.max(0, Math.min(100, row.pct_used));
  const over = row.pct_used >= 100;
  const warn = row.pct_used >= 80 && !over;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card p-2.5">
      <span className="text-xs font-medium capitalize text-foreground">
        {row.provider.replace(/_/g, " ")}
      </span>
      <span className="text-right font-mono text-xs font-semibold tabular-nums">
        {formatRuntimeCost(row.effective_cost)}{" "}
        <span className="font-normal text-muted-foreground">
          / {formatRuntimeCost(row.ceiling_usd)}
        </span>
      </span>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={
            over
              ? "h-full bg-destructive"
              : warn
                ? "h-full bg-amber-500"
                : "h-full bg-primary"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="col-span-2 text-[10px] text-muted-foreground">
        {row.run_count} paid run{row.run_count === 1 ? "" : "s"} ·{" "}
        {row.pct_used.toFixed(1)}% of monthly ceiling
      </span>
    </div>
  );
}

export function SeoSpendPanel() {
  const spend = useSeoSpendSummary();

  if (spend.isError) {
    return (
      <QueryError error={spend.error} onRetry={() => void spend.refetch()} />
    );
  }
  if (spend.isLoading || !spend.data) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading SEO provider
        spend…
      </div>
    );
  }

  const data = spend.data;
  const paidThisMonth = data.this_month.filter(
    (row) => row.effective_cost > 0 || row.run_count > 0,
  );
  const rejectionColumns: MatrxColumnDef<SeoBudgetRejectionRow>[] = [
    {
      id: "provider",
      accessorKey: "provider",
      header: "Provider",
      filter: "select",
      cell: (row) => (
        <span className="capitalize">{row.provider.replaceAll("_", " ")}</span>
      ),
    },
    {
      id: "ceiling",
      accessorKey: "ceiling",
      header: "Ceiling",
      filter: "select",
      cell: (row) => (
        <Badge variant="destructive" className="text-[9px]">
          {row.ceiling ?? "budget exceeded"}
        </Badge>
      ),
    },
    {
      id: "spent_usd",
      accessorKey: "spent_usd",
      header: "Spent",
      filter: "number",
      align: "right",
      cell: (row) =>
        row.spent_usd === null ? "—" : formatRuntimeCost(row.spent_usd),
    },
    {
      id: "limit_usd",
      accessorKey: "limit_usd",
      header: "Limit",
      filter: "number",
      align: "right",
      cell: (row) =>
        row.limit_usd === null ? "—" : formatRuntimeCost(row.limit_usd),
    },
    {
      id: "occurred_at",
      accessorKey: "occurred_at",
      header: "When",
      filter: "text",
      cell: (row) =>
        new Date(row.occurred_at).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }),
    },
    {
      id: "run_id",
      accessorKey: "run_id",
      header: "Run",
      filter: "text",
      cellKind: "uuid",
      fk: { forbidden: true },
    },
  ];

  return (
    <div className="grid h-full grid-rows-[auto_auto_1fr] gap-3 overflow-y-auto p-1">
      <section className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            This month by provider
          </h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={() => void spend.refetch()}
            disabled={spend.isFetching}
          >
            Refresh
          </Button>
        </div>
        {paidThisMonth.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
            <CircleDollarSign className="h-4 w-4" /> No SEO provider spend
            recorded this month.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {paidThisMonth.map((row) => (
              <ProviderRow key={row.provider} row={row} />
            ))}
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">
          Org·provider monthly ceiling{" "}
          {formatRuntimeCost(data.org_provider_monthly_ceiling_usd)} ·
          platform-wide monthly ceiling{" "}
          {formatRuntimeCost(data.global_provider_monthly_ceiling_usd)} per
          provider (placeholder values, pending final ruling).
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Daily spend — last 30 days
        </h2>
        <SeoSpendChart points={data.daily_series} />
      </section>

      <section className="rounded-lg border border-border bg-card p-3">
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Recent budget
          rejections
        </h2>
        <MatrxDataTable
          urlState={{ id: "seo-budget-rejections" }}
          data={data.recent_budget_rejections}
          columns={rejectionColumns}
          getRowId={(row) => row.run_id}
          pageSize={10}
          pageSizeOptions={[10, 25, 50, 100]}
          emptyState={{
            title: "No recent budget rejections",
            description:
              "No runs were rejected for exceeding a spend ceiling in the last 30 days.",
          }}
        />
      </section>
    </div>
  );
}
