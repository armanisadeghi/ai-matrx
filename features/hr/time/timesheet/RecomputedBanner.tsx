"use client";

/**
 * features/hr/time/timesheet/RecomputedBanner.tsx — the `recomputed-since-approval` state
 * (L3-54, SPEC-TIME §2.4, §4.1).
 *
 * 🚨 THE FIGURES MOVED **AFTER** SOMEBODY APPROVED THEM. That is not a detail to fold into a
 * timestamp — it means an approval was given for a number that no longer exists, so the banner
 * shows **prior vs current**, names who triggered the recompute, and states that re-approval is
 * required before export.
 *
 * The superseded intervals are never deleted (`is_current=false` + `superseded_by_id`), so the
 * prior answer and its rule versions stay on disk. This banner is the only place a reader learns
 * that they should go looking for them.
 */

import { History } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Timesheet } from "../api/types";
import { formatHours, formatDateTimeInTz, viewerTimeZone } from "../shared/format";

type Recomputed = NonNullable<Timesheet["recomputedSinceApproval"]>;

export function RecomputedBanner({
  recomputed,
  audience,
  className,
}: {
  recomputed: Recomputed;
  audience: "employee" | "manager";
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-amber-500/50 bg-amber-500/5 p-4",
        className,
      )}
      role="status"
    >
      <div className="flex items-start gap-2.5">
        <History
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="min-w-0 space-y-2">
          <h2 className="text-sm font-semibold">
            These hours changed after this timecard was approved
          </h2>

          <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Approved as</dt>
              <dd className="font-semibold tabular-nums line-through decoration-2">
                {formatHours(recomputed.priorTotalHours)} hours
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Now calculated as</dt>
              <dd className="font-semibold tabular-nums">
                {formatHours(recomputed.currentTotalHours)} hours
              </dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground">
            Recalculated {formatDateTimeInTz(recomputed.at, viewerTimeZone())}
            {recomputed.byName ? ` after a change by ${recomputed.byName}` : ""}.
          </p>

          <p className="text-sm">
            {audience === "manager"
              ? "This timecard has to be approved again before it can go to payroll. The earlier calculation and the rules behind it are kept — nothing was overwritten."
              : "Your manager has to approve this again before it goes to payroll. The earlier calculation is kept on the record."}
          </p>
        </div>
      </div>
    </section>
  );
}
