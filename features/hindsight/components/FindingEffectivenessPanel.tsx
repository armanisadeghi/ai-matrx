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

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { getFindingEffectiveness } from "../api";
import type { FindingEffectiveness, UnitToken } from "../types";
import { hasSignal } from "../types";
import { KIND_COLOR, KIND_ICON, LEVER_LABEL } from "./tokens";

function pct(value: number | null | undefined): string {
  return hasSignal(value) ? `${Math.round(value * 100)}%` : "—";
}

/** Seconds → the coarsest unit that still reads honestly. */
function duration(seconds: number | null | undefined): string {
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
      {cheaper ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
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
    <Card className="p-3">
      <header className="mb-3">
        <h2 className="text-sm font-semibold">Is the advice any good?</h2>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Per lever, per unit: what Hindsight proposed, what a human accepted,
          and what a human <strong>undid</strong>. A dash means no signal yet —
          never a measured zero.
        </p>
      </header>

      {effectiveness.isLoading && <Skeleton className="h-32" />}
      {effectiveness.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load effectiveness: {(effectiveness.error as Error).message}
        </p>
      )}

      {!effectiveness.isLoading && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing proposed yet — enroll something and let a review run.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-1.5 pr-3 font-medium">Unit</th>
                <th className="py-1.5 pr-3 font-medium">Lever</th>
                <th className="py-1.5 pr-3 text-right font-medium">Proposed</th>
                <th className="py-1.5 pr-3 text-right font-medium">Applied</th>
                <th className="py-1.5 pr-3 text-right font-medium">Rejected</th>
                <th className="py-1.5 pr-3 text-right font-medium">Reverted</th>
                <th className="py-1.5 pr-3 text-right font-medium">Accept</th>
                <th className="py-1.5 pr-3 text-right font-medium">Revert rate</th>
                <th className="py-1.5 pr-3 text-right font-medium">To decide</th>
                <th className="py-1.5 text-right font-medium">Cost move</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const Icon = KIND_ICON[row.unit_token];
                // A lever whose applied changes get undone is the signal this
                // table exists to surface — make it impossible to scroll past.
                const alarming = hasSignal(row.revert_rate) && row.revert_rate > 0;
                return (
                  <tr key={row.id} data-testid="effectiveness-row">
                    <td className="py-1.5 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded",
                            KIND_COLOR[row.unit_token],
                          )}
                        >
                          <Icon className="h-3 w-3" />
                        </span>
                        <span className="max-w-[220px] truncate">
                          {row.unit_display_name ?? row.unit_id ?? "—"}
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge variant="outline" className="text-[10px]">
                        {LEVER_LABEL[row.lever]}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {row.findings_total}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {row.applied_count}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {row.rejected_count}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 pr-3 text-right tabular-nums",
                        alarming && "font-semibold text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {row.reverted_count}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {pct(row.accept_rate)}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 pr-3 text-right tabular-nums",
                        alarming && "font-semibold text-amber-600 dark:text-amber-400",
                      )}
                      title={
                        hasSignal(row.revert_rate)
                          ? "Of the changes actually applied on this lever, the share a human undid."
                          : "No signal: nothing has been applied on this lever yet."
                      }
                    >
                      {pct(row.revert_rate)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {duration(row.time_to_decision_seconds_avg)}
                    </td>
                    <td className="py-1.5 text-right">
                      <CostDelta row={row} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
