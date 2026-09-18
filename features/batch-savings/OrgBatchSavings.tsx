// features/batch-savings/OrgBatchSavings.tsx
//
// One organization's batch spend and savings, last 30 days — shown in the
// organization's AI budget section. Reads the same `batch.savings_summary` as the
// platform dashboard, scoped to this organization; RLS decides what the viewer
// may read.
//
// Doc: features/batch-savings/FEATURE.md

"use client";

import { useEffect, useState } from "react";
import { PiggyBank } from "lucide-react";
import { formatCount } from "@ai-matrx/kit/format";

import { usdPrecise } from "@/features/admin/spend/format";

import { fetchBatchSavings } from "./service";
import type { BatchSavingsSummary } from "./types";

const WINDOW_DAYS = 30;

export function OrgBatchSavings({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<BatchSavingsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - WINDOW_DAYS * 86_400_000);
    fetchBatchSavings({ from, to, organizationId, signal: controller.signal })
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(cause instanceof Error ? cause.message : "The batch savings read failed.");
      });
    return () => controller.abort();
  }, [organizationId]);

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <PiggyBank className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground">Batch AI work · last {WINDOW_DAYS} days</div>
        {error ? (
          <div className="text-xs text-destructive">Batch spend could not be read: {error}</div>
        ) : !data ? (
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        ) : data.items === 0 ? (
          <div className="text-xs text-muted-foreground">
            No background AI work ran through the batch lane for this organization in the last {WINDOW_DAYS} days.
          </div>
        ) : (
          <div className="text-xs tabular-nums text-muted-foreground">
            <span className="text-foreground">{usdPrecise(data.actualUsd)}</span> billed ·{" "}
            <span className="font-medium text-success">{usdPrecise(data.savedUsd)} saved</span>
            {data.discountPct !== null ? ` (${data.discountPct.toFixed(0)}% below live price)` : ""} ·{" "}
            {formatCount(data.items)} {data.items === 1 ? "item" : "items"}. Already included in the spend above.
          </div>
        )}
      </div>
    </div>
  );
}
