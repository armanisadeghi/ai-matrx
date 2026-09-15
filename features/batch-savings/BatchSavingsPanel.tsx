// features/batch-savings/BatchSavingsPanel.tsx
//
// "Saved by batching" — the Platform Spend dashboard's savings headline for the
// explorer's selected window, with the breakdown one click away.
//
// Modelled on AWS Cost Explorer's Savings Plans "savings realized" view: one
// confident number (what batching saved), the effective discount beside it, the
// on-demand equivalent it was measured against, and a breakdown by consumer and
// by provider/model underneath. Every number names its window and the item
// count it covers.
//
// THE HONESTY RULE: the saving is `live_equivalent_cost_usd − actual_cost_usd`
// from `batch.savings_summary` — actual tokens at the live catalog rate. The
// pre-submission estimate is shown only labelled as an estimate.
//
// Doc: features/batch-savings/FEATURE.md

"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, PiggyBank } from "lucide-react";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { count, usdPrecise } from "@/features/admin/spend/format";
import { buildBillingBatchSavingsScope } from "@/features/admin/spend/spend-surface-scope";
import { ADMIN_BILLING_SPEND_SURFACE_NAME } from "@/features/surfaces/manifests/admin-billing-spend.manifest";
import { useSurfaceScopeContribution } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

import { fetchBatchSavings } from "./service";
import type { BatchSavingsRow, BatchSavingsSummary } from "./types";

export interface BatchSavingsPanelProps {
  from: Date | null;
  to: Date | null;
  /** Human window name, e.g. "Last 7 days". Always shown beside the numbers. */
  windowLabel: string;
  organizationId?: string | null;
  /** Explorer filters this panel cannot apply — named, never silently ignored. */
  ignoredFilters?: string[];
  refreshKey?: number;
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function Tile({
  label,
  value,
  hint,
  tone = "normal",
  hero = false,
  className = "",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "normal" | "success" | "muted";
  hero?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex min-w-0 flex-col justify-between rounded-md border px-3 py-2",
        tone === "success" ? "border-success/40 bg-success/5" : "border-border bg-card",
        className,
      ].join(" ")}
    >
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={[
          "truncate font-semibold tabular-nums leading-tight",
          hero ? "text-3xl" : "text-lg",
          tone === "success" ? "text-success" : tone === "muted" ? "text-muted-foreground" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </div>
      <div className="min-h-4 truncate text-[11px] text-muted-foreground" title={hint}>
        {hint}
      </div>
    </div>
  );
}

function LaneBar({ data }: { data: BatchSavingsSummary }) {
  const { ledgerUsd, liveUsd, batchUsd, escalatedUsd } = data.lanes;
  const share = (v: number) => (ledgerUsd > 0 ? Math.max((v / ledgerUsd) * 100, v > 0 ? 0.5 : 0) : 0);
  return (
    <div className="flex min-w-0 flex-col justify-between gap-1 rounded-md border border-border bg-card px-3 py-2">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Spend by lane
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full bg-primary/70" style={{ width: `${share(liveUsd)}%` }} />
        <div className="h-full bg-success" style={{ width: `${share(batchUsd)}%` }} />
        <div className="h-full bg-warning" style={{ width: `${share(escalatedUsd)}%` }} />
      </div>
      <div className="flex min-w-0 flex-wrap gap-x-3 text-[11px] tabular-nums text-muted-foreground">
        <span>
          <span className="text-foreground">Live</span> {usdPrecise(liveUsd)}
        </span>
        <span>
          <span className="text-success">Batch</span> {usdPrecise(batchUsd)} · {count(data.lanes.batchExecutions)}
        </span>
        {escalatedUsd > 0 ? (
          <span>
            <span className="text-warning">Escalated</span> {usdPrecise(escalatedUsd)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const columns = (first: string): MatrxColumnDef<BatchSavingsRow>[] => [
  {
    id: "label",
    header: first,
    accessorFn: (r) => r.label,
    width: 220,
    cell: (r) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{r.label}</div>
        {r.sublabel ? <div className="truncate text-[11px] text-muted-foreground">{r.sublabel}</div> : null}
      </div>
    ),
  },
  { id: "items", header: "Items", accessorFn: (r) => r.items, width: 70, align: "right", cell: (r) => <span className="tabular-nums">{count(r.items)}</span> },
  { id: "actual", header: "Billed", accessorFn: (r) => r.actualUsd, width: 100, align: "right", cell: (r) => <span className="tabular-nums">{usdPrecise(r.actualUsd)}</span> },
  { id: "live", header: "At live price", accessorFn: (r) => r.liveEquivalentUsd, width: 110, align: "right", cell: (r) => <span className="tabular-nums text-muted-foreground">{usdPrecise(r.liveEquivalentUsd)}</span> },
  { id: "saved", header: "Saved", accessorFn: (r) => r.savedUsd, width: 100, align: "right", cell: (r) => <span className="tabular-nums text-success">{usdPrecise(r.savedUsd)}</span> },
  { id: "discount", header: "Discount", accessorFn: (r) => r.discountPct ?? -1, width: 90, align: "right", cell: (r) => <span className="tabular-nums">{pct(r.discountPct)}</span> },
];

export function BatchSavingsPanel({
  from,
  to,
  windowLabel,
  organizationId,
  ignoredFilters = [],
  refreshKey = 0,
}: BatchSavingsPanelProps) {
  const [data, setData] = useState<BatchSavingsSummary | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fromIso = from?.toISOString() ?? null;
  const toIso = to?.toISOString() ?? null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchBatchSavings({
      from: fromIso ? new Date(fromIso) : null,
      to: toIso ? new Date(toIso) : null,
      organizationId,
      signal: controller.signal,
    })
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(cause instanceof Error ? cause : new Error("The batch savings read failed."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fromIso, toIso, organizationId, refreshKey]);

  const scope = `${windowLabel}${data ? ` · ${count(data.items)} batch ${data.items === 1 ? "item" : "items"}` : ""}`;

  useSurfaceScopeContribution(
    ADMIN_BILLING_SPEND_SURFACE_NAME,
    "BatchSavingsPanel",
    () =>
      buildBillingBatchSavingsScope({
        loading,
        error,
        data,
        breakdownOpen: open,
        ignoredFilters,
      }),
  );

  return (
    <section className="flex min-w-0 flex-col gap-2" aria-busy={loading}>
      <header className="flex min-w-0 flex-wrap items-center gap-2">
        <PiggyBank className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Saved by batching</h2>
        <span className="min-w-0 truncate text-xs tabular-nums text-muted-foreground">{scope}</span>
        {ignoredFilters.length > 0 ? (
          <span className="text-[11px] text-warning">
            Not filtered by {ignoredFilters.join(", ")} — batch savings cut by organization only.
          </span>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          The batch savings read failed — no batch numbers are shown. {error.message}
        </div>
      ) : !data ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`h-16 animate-pulse rounded-md border border-border bg-muted/40 ${i === 0 ? "col-span-2" : ""}`} />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Tile
              className="col-span-2"
              hero
              tone={data.savedUsd > 0 ? "success" : "muted"}
              label="Saved by batching"
              value={usdPrecise(data.savedUsd)}
              hint={
                data.items === 0
                  ? `No batch work completed in ${windowLabel.toLowerCase()}`
                  : `${pct(data.discountPct)} below live price · ${count(data.items)} items · ${windowLabel}`
              }
            />
            <Tile label="Batch billed" value={usdPrecise(data.actualUsd)} hint="what the providers charged" />
            <Tile
              label="Same work at live price"
              value={usdPrecise(data.liveEquivalentUsd)}
              hint="actual tokens × the model's live catalog rate"
            />
            <div className="col-span-2">
              <LaneBar data={data} />
            </div>
          </div>

          {data.unpricedItems > 0 ? (
            <p className="text-[11px] text-destructive">
              {count(data.unpricedItems)} completed batch {data.unpricedItems === 1 ? "item has" : "items have"} no
              catalog price, so {data.unpricedItems === 1 ? "it is" : "they are"} left out of every number above.
            </p>
          ) : null}
          {data.escalatedItems > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {count(data.escalatedItems)} {data.escalatedItems === 1 ? "item" : "items"} missed its deadline and ran
              live ({usdPrecise(data.escalatedActualUsd)}); those saved nothing and are counted as such.
            </p>
          ) : null}

          {data.items > 0 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex min-h-8 items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
                aria-expanded={open}
              >
                {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                Breakdown by consumer and by model
                <span className="tabular-nums">
                  · pre-submission estimate for these items was {usdPrecise(data.preSubmissionEstimateUsd)} (an estimate,
                  never the saving basis)
                </span>
              </button>
              {open ? (
                <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                  <MatrxDataTable
                    urlState={{ id: "batch-savings-purpose" }}
                    data={data.byPurpose}
                    columns={columns("Consumer")}
                    getRowId={(r) => r.key}
                    pageSize={10}
                    emptyState={{ title: "No batch consumers in this window." }}
                    toolbar={{ title: "By consumer" }}
                  />
                  <MatrxDataTable
                    urlState={{ id: "batch-savings-model" }}
                    data={data.byModel}
                    columns={columns("Model")}
                    getRowId={(r) => r.key}
                    pageSize={10}
                    emptyState={{ title: "No batch models in this window." }}
                    toolbar={{ title: "By provider / model" }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
