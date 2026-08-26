"use client";

/**
 * features/hr/time/timesheet/BulkApproveDialog.tsx — L3-53 / SPEC-TIME §6.3.
 *
 * 🚨 **THE PRE-COMMIT MANIFEST IS MANDATORY.** §6.3, in the spec's own words:
 * *"'Approve 47 timecards' with no manifest is not an approval, it is a click."*
 * Before anything commits, this dialog lists exactly which employments, how many hours each,
 * how much overtime, how many premium lines, and how many open disputes.
 *
 * 🚨 ROWS WITH AN OPEN EXCEPTION ARE **EXCLUDED**, and the dialog says which and why. They can be
 * approved individually once each exception is resolved or explicitly waived with a written reason.
 * There is no "approve anyway" that leaves no trace.
 *
 * 🚨 `disputed` ROWS ARE **INCLUDED** AND COUNTED SEPARATELY. Approving over a preserved
 * disagreement is legitimate and recorded; hiding it is not. The manifest names those people so the
 * approver knows they are signing over an open objection.
 *
 * 🚨 **PER-STEP OUTCOMES, NEVER ALL-OR-NOTHING.** The engine returns one row per step and this
 * renders successes and failures separately, each failure with its own reason.
 *
 * ⚠️ NO GRAND TOTAL OF HOURS IS SHOWN, AND THAT IS DELIBERATE (L3-74, §9.2). Every figure below is
 * the server's own per-timecard number. Adding them up in the browser would be the client computing
 * hours — the exact thing `scripts/check-hr-time-arithmetic.ts` fails a build for. The manifest
 * therefore lists per person and counts rows, which is what an approver has to read anyway before
 * signing. Recorded as an open question for the lane owner: a true total belongs in a server-side
 * bulk-preview, not in this dialog.
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import type { HrFixtureCase } from "@/features/hr/mock/transport";

import type { PeriodGridRow } from "../api/types";
import { RowStateChip } from "../shared/badges";
import { formatHours, pluralize } from "../shared/format";
import { RefusalNotice } from "../shared/RefusalNotice";
import {
  bulkDecideWorkflowSteps,
  type BulkDecisionOutcome,
} from "../shared/workflowApi";

export interface BulkApproveSelection {
  /** Rows the approver picked that the server will accept. */
  eligible: PeriodGridRow[];
  /** Rows removed because an exception is open on them — named, never silently dropped. */
  excludedForExceptions: PeriodGridRow[];
}

/**
 * The eligibility split, done once so the grid and the dialog cannot disagree.
 * Counting exceptions is counting rows; nothing here touches hours.
 */
export function splitForBulk(rows: PeriodGridRow[]): BulkApproveSelection {
  const eligible: PeriodGridRow[] = [];
  const excludedForExceptions: PeriodGridRow[] = [];
  for (const row of rows) {
    if (row.openExceptionCount > 0) excludedForExceptions.push(row);
    else if (row.openStepId) eligible.push(row);
  }
  return { eligible, excludedForExceptions };
}

export function BulkApproveDialog({
  open,
  onOpenChange,
  rows,
  bulkMax,
  mockCase,
  onCommitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Everything the approver checked, before the exception gate. */
  rows: PeriodGridRow[];
  /** `wf.inbox.bulk_max`. A knob, never a constant — the caller reads it. */
  bulkMax: number;
  mockCase?: HrFixtureCase;
  onCommitted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [outcomes, setOutcomes] = useState<BulkDecisionOutcome[] | null>(null);

  const { eligible, excludedForExceptions } = splitForBulk(rows);
  const disputed = eligible.filter((row) => row.hasDispute);
  const withOvertime = eligible.filter((row) => row.hoursOvertime > 0 || row.hoursDoubletime > 0);
  const withPremiums = eligible.filter((row) => row.premiumLineCount > 0);
  const overCap = eligible.length > bulkMax;

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const stepIds = eligible
        .map((row) => row.openStepId)
        .filter((id): id is string => id !== null);
      const result = await bulkDecideWorkflowSteps(stepIds, "approve", null, { mockCase });
      setOutcomes(result.outcomes ?? []);
      const granted = (result.outcomes ?? []).filter((o) => o.granted).length;
      if (granted > 0) toast.success(`${pluralize(granted, "timecard")} approved.`);
      onCommitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {outcomes ? "What happened" : `Approve ${pluralize(eligible.length, "timecard")}`}
          </DialogTitle>
          <DialogDescription>
            {outcomes
              ? "Each timecard was decided on its own. Anything that failed is listed with its reason."
              : "Read this before you approve. These are the payroll figures you are signing off."}
          </DialogDescription>
        </DialogHeader>

        <RefusalNotice error={error} />

        {outcomes ? (
          <BulkOutcomes outcomes={outcomes} rows={eligible} />
        ) : (
          <div className="space-y-4">
            {/* THE COUNTS — rows, not hours. */}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Timecards" value={String(eligible.length)} />
              <Stat label="With overtime" value={String(withOvertime.length)} />
              <Stat label="With premium lines" value={String(withPremiums.length)} />
              <Stat
                label="With an open disagreement"
                value={String(disputed.length)}
                emphasis={disputed.length > 0}
              />
            </dl>

            {disputed.length > 0 ? (
              <p className="rounded-md border border-orange-500/40 bg-orange-500/5 px-3 py-2 text-xs">
                {pluralize(disputed.length, "of these people has", "of these people have")} said
                they do not agree with their hours: {disputed.map((r) => r.employeeDisplayName).join(", ")}.
                Approving over a recorded disagreement is allowed, and the disagreement stays on the
                record afterwards.
              </p>
            ) : null}

            {excludedForExceptions.length > 0 ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                <p className="font-medium">
                  {pluralize(excludedForExceptions.length, "timecard is", "timecards are")} not
                  included, because {excludedForExceptions.length === 1 ? "it has" : "they have"} an
                  open exception:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {excludedForExceptions.map((row) => (
                    <li key={row.employmentId}>
                      {row.employeeDisplayName} —{" "}
                      {pluralize(row.openExceptionCount, "open exception")}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-muted-foreground">
                  Resolve each one, or waive it with a written reason, then approve that timecard on
                  its own.
                </p>
              </div>
            ) : null}

            {overCap ? (
              <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                You have selected {eligible.length} timecards and the limit is {bulkMax}. Narrow the
                selection.
              </p>
            ) : null}

            {/* THE MANIFEST ITSELF — exactly which employments, and their own figures. */}
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[32rem] text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="px-3 py-2 font-medium">Employee</th>
                    <th className="px-3 py-2 text-right font-medium">Hours</th>
                    <th className="px-3 py-2 text-right font-medium">Overtime</th>
                    <th className="px-3 py-2 text-right font-medium">Double time</th>
                    <th className="px-3 py-2 text-right font-medium">Premium lines</th>
                    <th className="px-3 py-2 font-medium">State</th>
                  </tr>
                </thead>
                <tbody>
                  {eligible.map((row) => (
                    <tr key={row.employmentId} className="border-b border-border/60">
                      <td className="px-3 py-1.5">{row.employeeDisplayName}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatHours(row.totalHours)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatHours(row.hoursOvertime)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatHours(row.hoursDoubletime)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {row.premiumLineCount}
                      </td>
                      <td className="px-3 py-1.5">
                        <RowStateChip state={row.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Figures are per timecard, exactly as the payroll engine calculated them. This page does
              not add them up — a total worked out in a browser is a total that can disagree with
              payroll.
            </p>
          </div>
        )}

        <DialogFooter>
          {outcomes ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy || overCap || eligible.length === 0}
                onClick={() => void commit()}
              >
                Approve {pluralize(eligible.length, "timecard")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={
          emphasis
            ? "text-lg font-semibold tabular-nums text-orange-700 dark:text-orange-300"
            : "text-lg font-semibold tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** Successes and failures, rendered SEPARATELY, each failure carrying its own reason. */
function BulkOutcomes({
  outcomes,
  rows,
}: {
  outcomes: BulkDecisionOutcome[];
  rows: PeriodGridRow[];
}) {
  const nameFor = (stepId: string) =>
    rows.find((row) => row.openStepId === stepId)?.employeeDisplayName ?? "This timecard";
  const granted = outcomes.filter((o) => o.granted);
  const refused = outcomes.filter((o) => !o.granted);

  return (
    <div className="space-y-4">
      <section>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Approved ({granted.length})
        </h3>
        {granted.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">Nothing was approved.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-xs">
            {granted.map((o) => (
              <li key={o.step_id}>{nameFor(o.step_id)}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <XCircle className="h-4 w-4 text-destructive" aria-hidden />
          Not approved ({refused.length})
        </h3>
        {refused.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">Everything went through.</p>
        ) : (
          <ul className="mt-1 space-y-1.5 text-xs">
            {refused.map((o) => (
              <li
                key={o.step_id}
                className="rounded border border-destructive/40 bg-destructive/5 px-2.5 py-1.5"
              >
                <span className="font-medium">{nameFor(o.step_id)}</span>
                {/* The reason, not a count. */}
                <span className="mt-0.5 block">{o.detail ?? o.reason ?? "The server refused this one and did not say why."}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
