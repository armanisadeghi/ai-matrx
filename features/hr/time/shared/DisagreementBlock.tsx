"use client";

/**
 * features/hr/time/shared/DisagreementBlock.tsx — L3-59 / SPEC-TIME §5.5.
 *
 * 🚨 **BOTH VALUES, SIDE BY SIDE. NEVER THE MANAGER'S VALUE WITH A FOOTNOTE.**
 *
 * This component is the whole of §5.5 and every clause of it is load-bearing:
 *
 *   • The employee's `disputeNote` is rendered **verbatim and attributed**. Nothing and nobody can
 *     edit it — not the manager, not an approval, not this component.
 *   • The manager's `disputeResolution` is a **separate, separately-labelled field**. It is not an
 *     answer that replaces the employee's words; it sits beside them.
 *   • There is **no "disputed" chip that an approval clears.** The disagreement survives approval,
 *     export and lock, and rides the export as evidence. A UI that hides it after approval has
 *     destroyed the record of a disagreement about wages.
 *
 * That last point is why this renders whenever `dispute` exists — the caller passes the row state
 * for context, never as a condition.
 */

import { MessageSquareWarning } from "lucide-react";

import { cn } from "@/lib/utils";

import type { PayPeriodEmploymentState, TimesheetDispute } from "../api/types";
import { formatHours, formatDateTimeInTz, viewerTimeZone } from "./format";

export function DisagreementBlock({
  dispute,
  /** The computed figure the engine stands behind, for the side-by-side. */
  computedTotalHours,
  rowState,
  className,
}: {
  dispute: TimesheetDispute;
  computedTotalHours: number;
  rowState: PayPeriodEmploymentState;
  className?: string;
}) {
  const settled = rowState === "approved" || rowState === "exported" || rowState === "locked";

  return (
    <section
      className={cn(
        "rounded-lg border border-orange-500/40 bg-orange-500/5 p-4",
        className,
      )}
      aria-label="Recorded disagreement about these hours"
    >
      <header className="flex items-start gap-2">
        <MessageSquareWarning
          className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400"
          aria-hidden
        />
        <div>
          <h3 className="text-sm font-semibold">The employee does not agree with these hours</h3>
          <p className="text-xs text-muted-foreground">
            Recorded {formatDateTimeInTz(dispute.disputedAt, viewerTimeZone())}. This stays
            on the record through approval, export and lock — approving does not remove it.
          </p>
        </div>
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            What the system calculated
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatHours(computedTotalHours)}{" "}
            <span className="text-xs font-normal text-muted-foreground">hours</span>
          </p>
        </div>

        <div className="rounded-md border border-orange-500/40 bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            What the employee says
          </p>
          {/* VERBATIM. `whitespace-pre-wrap` so their line breaks survive; no truncation, ever. */}
          <p className="mt-1 whitespace-pre-wrap text-sm">{dispute.disputeNote}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border bg-card p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          The manager&rsquo;s response
        </p>
        {dispute.disputeResolution ? (
          <>
            <p className="mt-1 whitespace-pre-wrap text-sm">{dispute.disputeResolution}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {dispute.disputeResolvedByName ?? "A manager"}
              {dispute.disputeResolvedAt
                ? ` · ${formatDateTimeInTz(dispute.disputeResolvedAt, viewerTimeZone())}`
                : null}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            No response has been recorded yet.
            {settled
              ? " This timecard was approved with the disagreement still open, which is allowed and is part of the record."
              : null}
          </p>
        )}
      </div>
    </section>
  );
}
