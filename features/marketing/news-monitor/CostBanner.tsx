"use client";

/**
 * The monthly run-cost ceiling, said out loud (NEWS-ENGINE-SPEC §8, ruling C):
 * a warning at `news.cost_warn_pct` of `news.monthly_run_cost_ceiling_usd`, and
 * — once scheduled runs are paused at the ceiling — a loud notice with a
 * Resume control (`POST /news/cost/resume`). Run now always proceeds, and the
 * banner says so. Nothing pauses silently.
 */

import { useState } from "react";
import { AlertTriangle, Loader2, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { resumeMonitorAutoRuns } from "./api";

export function CostBanner({
  organizationId,
  pausedAt,
  pausedReason,
  monthToDateUsd,
  ceilingUsd,
  warnPct,
  onResumed,
}: {
  organizationId: string;
  pausedAt: string | null;
  pausedReason: string | null;
  monthToDateUsd: number | null;
  ceilingUsd: number | null;
  /** `news.cost_warn_pct` as the last run resolved it; null = unknown, so no early warning. */
  warnPct: number | null;
  onResumed: () => void;
}) {
  const dispatch = useAppDispatch();
  const { format } = useCostDisplay();
  const [resuming, setResuming] = useState(false);

  const spent = monthToDateUsd ?? 0;
  const ceiling = ceilingUsd ?? 0;
  const pct = ceiling > 0 ? (spent / ceiling) * 100 : 0;
  const warn = !pausedAt && ceiling > 0 && warnPct != null && pct >= warnPct;
  if (!pausedAt && !warn) return null;

  const resume = async () => {
    setResuming(true);
    try {
      const result = await resumeMonitorAutoRuns(dispatch, organizationId);
      const resumed = result.resumed_tracker_ids?.length ?? 0;
      toast.success(
        `Scheduled runs resumed for ${resumed} monitor${resumed === 1 ? "" : "s"} for the rest of ${result.month}.`,
      );
      onResumed();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setResuming(false);
    }
  };

  return (
    <div
      role="alert"
      data-surface-value="news_cost_banner"
      className={cn(
        "flex flex-wrap items-start gap-2 rounded-md border px-3 py-2 text-sm",
        pausedAt
          ? "border-destructive/50 bg-destructive/10 text-foreground"
          : "border-warning/50 bg-warning/10 text-foreground",
      )}
    >
      <AlertTriangle
        className={cn("mt-0.5 h-4 w-4 shrink-0", pausedAt ? "text-destructive" : "text-warning")}
      />
      <div className="min-w-0 flex-1">
        {pausedAt ? (
          <>
            <p className="font-medium">
              Scheduled runs are paused: this organization reached its monthly news spending limit.
            </p>
            <p className="text-xs text-muted-foreground">
              {format(spent)} of {format(ceiling)} spent this month
              {pausedReason ? ` — ${pausedReason}` : ""}. Run now still works. Resume lets
              scheduled runs spend past the limit for the rest of this month; the limit itself
              is a setting your organization can change.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">
              News monitoring has used {Math.round(pct)}% of this month&apos;s spending limit.
            </p>
            <p className="text-xs text-muted-foreground">
              {format(spent)} of {format(ceiling)}. At the limit, scheduled runs pause and you are
              told; Run now always works.
            </p>
          </>
        )}
      </div>
      {pausedAt ? (
        <Button size="sm" onClick={() => void resume()} disabled={resuming}>
          {resuming ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
          Resume scheduled runs
        </Button>
      ) : null}
    </div>
  );
}
