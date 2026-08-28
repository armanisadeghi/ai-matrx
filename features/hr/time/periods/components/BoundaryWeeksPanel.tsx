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
  /**
   * 🚨 The SERVER's own boundary sentence (`hr_pay_period_get` → `boundary_note`), preferred over
   * the client's whenever it is present. One authority for the wording means a change to how
   * overtime is attributed is stated in one place, not re-worded independently in every client —
   * including the native HR mobile app, which will consume the same field.
   */
  boundaryNote?: string | null;
  /**
   * 🚨 Whether the boundary answer has been COMPUTED. `boundaryWorkweekIds` is written only by
   * `hr.recompute_apply`, so on a period with no computed intervals an empty array means "nobody
   * has looked" — and saying "no workweek straddles this period" from that is asserting a
   * world-fact this panel does not have. Optional so the list read, which does not carry it,
   * keeps its existing behaviour.
   */
  boundaryComputed?: boolean;
}

export function BoundaryWeeksPanel({
  boundaryWorkweekIds,
  boundaryNote,
  boundaryComputed,
}: BoundaryWeeksPanelProps) {
  // The client sentence is the fallback for the list read, which does not carry `boundary_note`.
  const sentence = boundaryNote ?? boundaryWeeksSentence(boundaryWorkweekIds);

  // 🚨 NOT COMPUTED IS NOT THE SAME ANSWER AS NONE FOUND (hr_l3_92). When the server says the
  // boundary question has not been asked of anything yet, this panel says exactly that instead of
  // claiming every week is wholly inside the period. `undefined` keeps the old wording for the
  // list read, which does not carry the flag.
  if (!sentence && boundaryComputed === false) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
          Boundary weeks
        </h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
          No hours have been computed for this period yet, so whether any workweek straddles its
          edges is not yet known. This answer appears once the recompute engine has run.
        </p>
      </section>
    );
  }

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
