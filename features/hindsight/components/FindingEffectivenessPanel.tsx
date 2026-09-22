"use client";

/**
 * FindingEffectivenessPanel — is Hindsight's advice on this unit any good?
 *
 * C-19. Per lever per governed unit: how many findings it proposed, how many a
 * human applied, rejected, or UNDID, how long decisions take, and whether the
 * change moved cost. This is Hindsight measuring itself, and `revert_rate` is
 * the number that says "stop trusting this lever on this unit".
 *
 * THE ONE RULE: a null is NO SIGNAL, never zero. `revert_rate === null` means
 * nothing has been applied yet; `revert_rate === 0` means changes were applied
 * and none were undone. Those are different facts, and the whole reason to
 * measure is to tell them apart — so every number here goes through `hasSignal`
 * and renders "—" rather than a fabricated 0.
 */
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp } from "lucide-react";

import { Skeleton } from "@ai-matrx/design-system";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { cn } from "@/lib/utils";

import { getFindingEffectiveness } from "../api";
import type { FindingEffectiveness, UnitToken } from "../types";
import { hasSignal } from "../types";
import { KIND_COLOR, KIND_ICON, LEVER_LABEL } from "./tokens";

/** The endpoint supplies rows but no total or cap receipt. */
export const FINDING_EFFECTIVENESS_COVERAGE = {
  noun: "unit/lever aggregate",
  answeredBy: "client" as const,
};

export function effectivenessPercent(value: number | null | undefined): string {
  return hasSignal(value) ? `${Math.round(value * 100)}%` : "—";
}

/** Seconds → the coarsest unit that still reads honestly. */
export function effectivenessDuration(
  seconds: number | null | undefined,
): string {
  if (!hasSignal(seconds)) return "—";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

/** Cost movement after a change. Negative is cheaper, and says so. */
function CostDelta({ row }: { row: FindingEffectiveness }) {
  if (!hasSignal(row.cost_delta_usd_avg)) {
    return (
      <span
        className="text-muted-foreground"
        title="No signal: no applied finding on this lever had real traffic on BOTH the pre-apply and post-apply versions. Not zero — unmeasured."
      >
        —
      </span>
    );
  }
  const delta = row.cost_delta_usd_avg;
  const cheaper = delta < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums",
        cheaper
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-amber-600 dark:text-amber-400",
      )}
      title={`Mean spend per request after the change minus before it, across ${row.cost_signal_findings} finding(s) with traffic on both versions.`}
    >
      {cheaper ? (
        <TrendingDown className="h-3 w-3" />
      ) : (
        <TrendingUp className="h-3 w-3" />
      )}
      {cheaper ? "-" : "+"}${Math.abs(delta).toFixed(4)}
    </span>
  );
}

export function FindingEffectivenessPanel({
  unitToken,
  unitId,
}: {
  unitToken?: UnitToken;
  unitId?: string;
}) {
  const effectiveness = useQuery({
    queryKey: ["hindsight", "finding-effectiveness", unitToken, unitId],
    queryFn: () => getFindingEffectiveness({ unitToken, unitId }),
  });

  const rows = effectiveness.data ?? [];

  return (
    <section className="space-y-2">
      <p className="max-w-2xl text-xs text-muted-foreground">
        Per lever, per unit: what Hindsight proposed, what a human accepted, and
        what a human <strong>undid</strong>. A dash means no signal yet — never
        a measured zero.
      </p>
      {effectiveness.isLoading && <Skeleton className="h-32" />}
      {effectiveness.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-sm text-red-600 dark:text-red-400"
        >
          Could not load effectiveness: {(effectiveness.error as Error).message}
          <button
            type="button"
            className="underline"
            onClick={() => void effectiveness.refetch()}
          >
            Retry
          </button>
        </div>
      )}
      {!effectiveness.isLoading &&
        (!effectiveness.isError || rows.length > 0) && (
          <MatrxDataTable<FindingEffectiveness>
            urlState={{
              id: "hindsight-finding-effectiveness",
            }}
            tableId="hindsight/finding-effectiveness"
            data={rows}
            columns={FINDING_EFFECTIVENESS_COLUMNS}
            getRowId={(row) => row.id}
            toolbar={{
              title: "Is the advice any good?",
              search: true,
              searchPlaceholder: "Search units and levers…",
              refresh: { onRefresh: () => void effectiveness.refetch() },
            }}
            copy={false}
            detail={{ enabled: false }}
            coverage={FINDING_EFFECTIVENESS_COVERAGE}
            cellClassName={(row, columnId) =>
              hasSignal(row.revert_rate) &&
              row.revert_rate > 0 &&
              (columnId === "reverted" || columnId === "revert-rate")
                ? "font-semibold text-amber-600 dark:text-amber-400"
                : undefined
            }
            emptyState={{
              title: "Nothing proposed yet",
              description: "Enroll something and let a review run.",
            }}
          />
        )}
    </section>
  );
}

export const FINDING_EFFECTIVENESS_COLUMNS: MatrxColumnDef<FindingEffectiveness>[] =
  [
    {
      id: "unit",
      header: "Unit",
      accessorFn: (row) => row.unit_display_name ?? row.unit_id ?? "",
      filter: "text",
      width: 240,
      cell: (row) => {
        const Icon = KIND_ICON[row.unit_token];
        const unitName = row.unit_display_name ?? row.unit_id ?? "—";
        return (
          <span className="flex w-full max-w-full min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded",
                KIND_COLOR[row.unit_token],
              )}
            >
              <Icon className="h-3 w-3" />
            </span>
            <span className="min-w-0 truncate" title={unitName}>
              {unitName}
            </span>
          </span>
        );
      },
    },
    {
      id: "lever",
      header: "Lever",
      accessorKey: "lever",
      filter: "select",
      width: 150,
      cell: (row) => (
        <span className="inline-flex rounded border px-1.5 py-0.5 text-[10px]">
          {LEVER_LABEL[row.lever]}
        </span>
      ),
    },
    {
      id: "proposed",
      header: "Proposed",
      accessorKey: "findings_total",
      filter: "number",
      width: 96,
      className: "text-right tabular-nums",
      cell: (row) => row.findings_total,
    },
    {
      id: "applied",
      header: "Applied",
      accessorKey: "applied_count",
      filter: "number",
      width: 88,
      className: "text-right tabular-nums",
      cell: (row) => row.applied_count,
    },
    {
      id: "rejected",
      header: "Rejected",
      accessorKey: "rejected_count",
      filter: "number",
      width: 96,
      className: "text-right tabular-nums",
      cell: (row) => row.rejected_count,
    },
    {
      id: "reverted",
      header: "Reverted",
      accessorKey: "reverted_count",
      filter: "number",
      width: 96,
      className: "text-right tabular-nums",
      cell: (row) => row.reverted_count,
    },
    {
      id: "accept-rate",
      header: "Accept",
      accessorFn: (row) =>
        row.accept_rate === null || row.accept_rate === undefined
          ? null
          : row.accept_rate * 100,
      filter: "number",
      width: 88,
      className: "text-right tabular-nums",
      cell: (row) => effectivenessPercent(row.accept_rate),
    },
    {
      id: "revert-rate",
      header: "Revert rate",
      accessorFn: (row) =>
        row.revert_rate === null || row.revert_rate === undefined
          ? null
          : row.revert_rate * 100,
      filter: "number",
      width: 112,
      className: "text-right tabular-nums",
      cell: (row) => (
        <span
          title={
            hasSignal(row.revert_rate)
              ? "Of the changes actually applied on this lever, the share a human undid."
              : "No signal: nothing has been applied on this lever yet."
          }
        >
          {effectivenessPercent(row.revert_rate)}
        </span>
      ),
    },
    {
      id: "time-to-decision",
      header: "To decide",
      accessorKey: "time_to_decision_seconds_avg",
      filter: "number",
      width: 104,
      className: "text-right tabular-nums",
      cell: (row) => effectivenessDuration(row.time_to_decision_seconds_avg),
    },
    {
      id: "cost-move",
      header: "Cost move",
      accessorKey: "cost_delta_usd_avg",
      filter: "number",
      width: 118,
      className: "text-right",
      cell: (row) => <CostDelta row={row} />,
    },
  ];
