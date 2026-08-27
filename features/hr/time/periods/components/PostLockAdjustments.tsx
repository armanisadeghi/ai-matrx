"use client";

/**
 * features/hr/time/periods/components/PostLockAdjustments.tsx — the ONLY edit door after lock.
 *
 * 🚨 A LOCKED PERIOD IS NEVER REWRITTEN AND A DELIVERED EXPORT IS NEVER REGENERATED (SPEC-TIME §7.1,
 * §7.5). After lock, a correction is an `hr.time_adjustment` row that rides the **next** export,
 * tagged back to the **original** period. Both period ids are therefore rendered on every row and
 * never collapsed into one column: showing only one of them tells a payroll administrator that the
 * locked period was edited, which is exactly what did not happen.
 *
 * Route 29's punch-edit control is ABSENT once the period is locked, and FE-2's timesheet surface
 * links here instead. `hr.time_adjustment_create` refuses unless the original period is `locked` or
 * `closed` — before that, the fix is a punch edit, not an adjustment.
 *
 * 🚨 MONEY IS ABSENT, NOT ZERO, when a contributing rule is advisory. The server's flag is
 * `amount_pending` (read from `calc.amount_pending`), and it sits beside `amountDelta` for exactly
 * that reason: this component prints a SENTENCE, never a `—` and never a `$0`.
 *
 * NO CLIENT COMPUTES ANYTHING: `hoursDelta` and `amountDelta` arrive computed.
 */

import Link from "next/link";
import { FileWarning, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { formatHours, formatLocalDate, formatMoney } from "../../shared/format";
import type { PayPeriodRow } from "../../api/types";
import type { TimeAdjustmentRow } from "../api/periodReads";

export interface PostLockAdjustmentsProps {
  period: PayPeriodRow;
  rows: TimeAdjustmentRow[];
  isLoading: boolean;
}

const LOCKED_STATES = new Set(["locked", "closed", "reopened"]);

export function PostLockAdjustments({ period, rows, isLoading }: PostLockAdjustmentsProps) {
  const lockedYet = LOCKED_STATES.has(period.state);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">Corrections after lock</h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
            {lockedYet
              ? // The server ships `locked_period_note` on every row and it says the same thing;
                // this is the panel-level statement for when the list is empty and there is no row
                // to carry it.
                "This period is not editable. A correction is recorded as an adjustment that rides the next payroll export, tagged back to this period. The locked period itself is never rewritten and the delivered export is never regenerated."
              : "This period is still editable, so a correction here is a punch edit on the person's timesheet — not an adjustment. The adjustment lane opens once the period is locked."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-[44px]"
          disabled={!lockedYet}
          onClick={() => void announceComingSoon("hr.time-adjustment-create")}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Record a correction
        </Button>
      </div>

      {isLoading ? (
        <div className="p-4 text-[12px] text-muted-foreground">Loading corrections…</div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-[12px] text-muted-foreground">
          No corrections have been recorded against this period.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium text-foreground">
                  {row.employeeDisplayName}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {formatLocalDate(row.workDate, { year: true })} · {row.earningCodeName}
                  </span>
                </p>
                <p className="text-[13px] font-medium tabular-nums text-foreground">
                  {/* `hoursDelta` is nullable on the live payload; a missing figure stays dark. */}
                  {row.hoursDelta === null
                    ? "—"
                    : `${row.hoursDelta > 0 ? "+" : ""}${formatHours(row.hoursDelta)} h`}
                </p>
              </div>

              {/*
                🚨 The two periods, always both, never collapsed. The server sends IDS, not labels —
                it has no `target_period_label` — so this states the RELATIONSHIP in words rather
                than printing a blank where a period name used to be assumed.
              */}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {row.originalPayPeriodId === period.id
                  ? "Belongs to this period · "
                  : "Belongs to an earlier locked period · "}
                <span className="text-foreground">
                  {row.targetPayPeriodId === null
                    ? "rides the next open period"
                    : row.targetPayPeriodId === period.id
                      ? "paid in this period"
                      : "paid in a later period"}
                </span>
              </p>

              {row.reasonNote ? (
                <p className="mt-1.5 text-[12px] leading-relaxed text-foreground">{row.reasonNote}</p>
              ) : null}

              {row.amountPending ? (
                // Money is ABSENT. Not a zero, not a dash, not a guess.
                <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
                  <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    The hours above are correct and are payable. No amount is shown because a rule
                    that contributes to it is still awaiting verification — we will not print a
                    figure we cannot stand behind.
                  </span>
                </p>
              ) : row.amountDelta !== null ? (
                <p className="mt-1 text-[12px] tabular-nums text-muted-foreground">
                  {formatMoney(row.amountDelta)}
                </p>
              ) : null}

              {/*
                The workflow state comes from `hr.wf_for_target`, and its `deepLink` is the door into
                the ONE HR task inbox — where the decision is actually taken. No dead ends: an open
                instance the UI names is an identity that opens.
              */}
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                {row.workflow.open.length > 0 ? (
                  <>
                    <span>{row.workflow.open[0].state}</span>
                    {row.workflow.open[0].deepLink ? (
                      <Link
                        href={row.workflow.open[0].deepLink}
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        Open the approval
                      </Link>
                    ) : null}
                  </>
                ) : row.approvedAt ? (
                  <span>Approved</span>
                ) : (
                  <span>Not yet routed for approval</span>
                )}
                {row.exportedAt ? <span>· already carried on a payroll file</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
