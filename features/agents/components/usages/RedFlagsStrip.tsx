/**
 * RedFlagsStrip — the first thing the find-usages view renders: a resolution
 * of every red flag (breaking / silent / stale-pin counts), the "N usages
 * pinned behind" summary, and a one-click "Update all to active" bulk action.
 * All-clear shows a success state.
 */

"use client";

import { CircleCheck, Loader2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";
import { updateAllUsagesToActive } from "@/features/agents/redux/usages/usages.thunks";
import { selectBulkState } from "@/features/agents/redux/usages/usages.selectors";
import type { UsageScope } from "@/features/agents/redux/usages/usages.slice";
import type { RedFlagSummary } from "@/features/agents/redux/usages/usages.selectors";
import { DRIFT_SEVERITY_ORDER } from "./severity";
import { DriftSeverityBadge } from "./DriftSeverityBadge";

interface RedFlagsStripProps {
  agentId: string;
  scope: UsageScope;
  summary: RedFlagSummary;
}

export function RedFlagsStrip({ agentId, scope, summary }: RedFlagsStripProps) {
  const dispatch = useAppDispatch();
  const bulk = useAppSelector(selectBulkState);
  const running = bulk.status === "running" && bulk.agentId === agentId;

  const updatableCount = summary.updatableKeys.length;

  const handleUpdateAll = async () => {
    const ok = await confirm({
      title: `Update ${updatableCount} usage${updatableCount !== 1 ? "s" : ""} to the active version?`,
      description:
        "Every stale pin you can manage will be re-pinned to the agent's active version. Usages owned by others are not touched.",
      confirmLabel: "Update all",
    });
    if (!ok) return;
    try {
      const result = await dispatch(updateAllUsagesToActive({ agentId, scope })).unwrap();
      const skipped = result.skipped?.length ?? 0;
      toast.success(
        `Updated ${result.updated} usage${result.updated !== 1 ? "s" : ""}` +
          (skipped > 0 ? ` · ${skipped} skipped` : ""),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    }
  };

  if (!summary.hasRedFlags) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-success/5 px-3 py-2.5 text-sm">
        <CircleCheck className="h-4 w-4 text-success" aria-hidden />
        <span className="font-medium text-foreground">No red flags.</span>
        <span className="text-muted-foreground">
          All {summary.totalUsages} usage{summary.totalUsages !== 1 ? "s" : ""} are healthy.
        </span>
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-muted/30 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-semibold text-foreground">Red flags</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {DRIFT_SEVERITY_ORDER.map((sev) =>
            summary.bySeverity[sev] > 0 ? (
              <DriftSeverityBadge key={sev} severity={sev} count={summary.bySeverity[sev]} />
            ) : null,
          )}
        </div>
        {summary.stalePins > 0 && (
          <span className="text-xs text-muted-foreground">
            {summary.stalePins} pinned behind the active version
          </span>
        )}
        {updatableCount > 0 && (
          <Button
            size="sm"
            className="ml-auto h-7 gap-1.5 px-2.5 text-xs"
            onClick={handleUpdateAll}
            disabled={running}
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCw className="h-3 w-3" />
            )}
            Update all to active ({updatableCount})
          </Button>
        )}
      </div>
    </div>
  );
}
