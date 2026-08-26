"use client";

/**
 * features/hr/time/periods/components/BoundaryWeeksPanel.tsx — SPEC-TIME §2.7's named panel.
 *
 * 🚨 THIS PANEL IS NAMED AND EXPLAINED IN WORDS, NEVER RENDERED AS A BARE ID LIST.
 *
 *   *"2 workweeks straddle this period's edges. Overtime for those weeks is computed on the whole
 *    week and attributed to the period containing the week's end date."*
 *
 * The reason it is a requirement rather than a nicety: a payroll administrator reconciling this
 * period's hours against a workweek whose overtime lands in the NEXT period will conclude the
 * numbers are wrong. They are not — they are attributed by the week's end date, which is the FLSA
 * unit, and §9 rule 6 makes the workweek boundary a hard visual break for the same reason.
 *
 * Every export line carries its `workweek_id` so the reconciliation can actually be done
 * (fixture `OT-BOUND-01`), and each id here is an identity, so each one opens — no dead ends.
 *
 * NO CLIENT COMPUTES ANYTHING: `boundaryWorkweekIds` is the server's list.
 */

import { CalendarRange } from "lucide-react";

import { announceComingSoon } from "@/lib/coming-soon/announce";
import { Button } from "@/components/ui/button";
import { boundaryWeeksSentence } from "../periodStateMachine";

export interface BoundaryWeeksPanelProps {
  boundaryWorkweekIds: string[];
}

export function BoundaryWeeksPanel({ boundaryWorkweekIds }: BoundaryWeeksPanelProps) {
  const sentence = boundaryWeeksSentence(boundaryWorkweekIds);

  // No straddling weeks is a real and common answer, and saying so is better than an absent panel
  // that leaves a reader wondering whether we checked.
  if (!sentence) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
          Boundary weeks
        </h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
          No workweek straddles this period&apos;s edges. Every week in this period is wholly inside
          it, so no overtime is attributed to a neighbouring period.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
        Boundary weeks
      </h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-foreground">{sentence}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
        Every line on a payroll export from this period carries its workweek so the two can be
        reconciled against each other.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {boundaryWorkweekIds.map((id) => (
          <li key={id}>
            {/* An identity the UI names must open. The workweek detail is a tracked promise. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 font-mono text-[11px]"
              onClick={() => void announceComingSoon("hr.workweek-detail")}
            >
              {id.slice(0, 8)}…
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
