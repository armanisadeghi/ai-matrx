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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/features/marketing/components/shared/MarketingUi";
import { SeoSpendChart } from "@/features/marketing/components/operations/SeoSpendChart";
import { formatRuntimeCost } from "@/features/marketing/data/operations-format";
import {
  useSeoSpendSummary,
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
    return <QueryError error={spend.error} onRetry={() => void spend.refetch()} />;
  }
  if (spend.isLoading || !spend.data) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading SEO provider spend…
      </div>
    );
  }

  const data = spend.data;
  const paidThisMonth = data.this_month.filter((row) => row.effective_cost > 0 || row.run_count > 0);

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
            <CircleDollarSign className="h-4 w-4" /> No SEO provider spend recorded this month.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {paidThisMonth.map((row) => (
              <ProviderRow key={row.provider} row={row} />
            ))}
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">
          Org·provider monthly ceiling {formatRuntimeCost(data.org_provider_monthly_ceiling_usd)} ·
          platform-wide monthly ceiling {formatRuntimeCost(data.global_provider_monthly_ceiling_usd)} per
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
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Recent budget rejections
        </h2>
        {data.recent_budget_rejections.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No runs were rejected for exceeding a spend ceiling in the last 30 days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Provider</th>
                  <th className="py-1.5 pr-3 font-medium">Ceiling</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Spent / limit</th>
                  <th className="py-1.5 pr-3 font-medium">When</th>
                  <th className="py-1.5 pr-3 font-medium">Run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.recent_budget_rejections.map((rejection) => (
                  <tr key={rejection.run_id}>
                    <td className="py-1.5 pr-3 capitalize">{rejection.provider}</td>
                    <td className="py-1.5 pr-3">
                      <Badge variant="destructive" className="text-[9px]">
                        {rejection.ceiling ?? "budget exceeded"}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                      {rejection.spent_usd !== null
                        ? formatRuntimeCost(rejection.spent_usd)
                        : "—"}{" "}
                      /{" "}
                      {rejection.limit_usd !== null
                        ? formatRuntimeCost(rejection.limit_usd)
                        : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {new Date(rejection.occurred_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td
                      className="py-1.5 pr-3 font-mono text-[10px] text-muted-foreground"
                      title={rejection.run_id}
                    >
                      {rejection.run_id.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
