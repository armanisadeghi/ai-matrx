"use client";

/**
 * features/hr/time/timesheet/EmploymentPeriodDetail.tsx — ROUTE 29,
 * `/hr/time/timesheets/[employmentId]` (L3-54 … L3-57, L3-59, L3-64).
 *
 * One person's pay period in full: categorized hours per day, premium lines, the raw punches behind
 * every cell, edit history with reason and original value and rate-at-time, and the rule-snapshot
 * viewer behind every computed figure.
 *
 * 🚨 **APPROVING THIS ONE PERSON NEVER MOVES THE PAY PERIOD** (§6.4, §14 D7). It closes this
 * employment's step and sets THIS row to `approved`. **Rejecting** returns THIS row to `open` with
 * a required reason and reopens their attestation step — it does not un-submit a 400-person pay
 * group. Both are `hr.wf_decide` on this employment's step and nothing else.
 *
 * 🚨 **THE ATTESTATION CONTROL IS ABSENT HERE FOR EVERYONE BUT THE SUBJECT** (§2.2). This surface
 * never renders one: the employee attests on route 5.
 *
 * 🚨 **AFTER LOCK THE EDIT CONTROL IS ABSENT** and the adjustment lane is offered instead (§4.1).
 * Not disabled — absent. A greyed-out button teaches a manager that the product is broken; a
 * different, correct door teaches them what to do.
 */

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, PencilLine, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { toast } from "@/lib/toast";
import { hrPunchesHref, hrTimeExceptionsHref, hrTimePeriodHref } from "@/features/hr/routes";

import { getTimesheet } from "../api/service";
import type { Timesheet } from "../api/types";
import { PeriodStateChip, RowStateChip } from "../shared/badges";
import { DisagreementBlock } from "../shared/DisagreementBlock";
import { ExceptionsStrip } from "../shared/ExceptionsStrip";
import {
  crossZoneNotice,
  formatDateTimeInTz,
  formatHours,
  formatLocalDate,
  formatRate,
  viewerTimeZone,
} from "../shared/format";
import { HrTimeReadState, RefusalNotice } from "../shared/RefusalNotice";
import { RuleSnapshotProvider } from "../shared/RuleSnapshot";
import { useHrMockCase, useHrTimeQuery } from "../shared/useHrTimeQuery";
import { decideWorkflowStep } from "../shared/workflowApi";
import { RecomputedBanner } from "./RecomputedBanner";
import { TimesheetWeeks } from "./WeekBlocks";

const MIN_REASON_LENGTH = 2;

export function EmploymentPeriodDetail({
  employmentId,
  payPeriodId,
}: {
  employmentId: string;
  payPeriodId: string | null;
}) {
  const mockCase = useHrMockCase();
  const ready = Boolean(payPeriodId);

  const query = useHrTimeQuery<Timesheet>(
    (signal) => getTimesheet(employmentId, payPeriodId as string, { mockCase, signal }),
    [employmentId, payPeriodId, mockCase],
    ready,
  );

  return (
    <RuleSnapshotProvider>
      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-4">
        <HrTimeReadState
          loading={query.loading}
          error={query.error}
          isEmpty={!ready}
          emptySentence="Pick a pay period to see this person's timesheet."
        >
          {query.data ? (
            <DetailBody timesheet={query.data} mockCase={mockCase} onChanged={query.refetch} />
          ) : null}
        </HrTimeReadState>
      </div>
    </RuleSnapshotProvider>
  );
}

function DetailBody({
  timesheet,
  mockCase,
  onChanged,
}: {
  timesheet: Timesheet;
  mockCase: ReturnType<typeof useHrMockCase>;
  onChanged: () => void;
}) {
  if (timesheet.noTimesheetReason) {
    return (
      <section className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-base font-semibold">
          {timesheet.employeeDisplayName} has no timesheet for this period
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{timesheet.noTimesheetReason}</p>
      </section>
    );
  }

  const locked = timesheet.rowState === "locked" || timesheet.rowState === "exported";
  const zoneNotice = timesheet.weeks[0]?.days[0]
    ? crossZoneNotice(timesheet.weeks[0].days[0].tz)
    : null;

  return (
    <>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-base font-semibold">{timesheet.employeeDisplayName}</h1>
          {/* The two machines, side by side and labelled apart (§14 D8). */}
          <RowStateChip state={timesheet.rowState} />
          <PeriodStateChip state={timesheet.payPeriod.state} />
        </div>
        <p className="text-xs text-muted-foreground">
          {formatLocalDate(timesheet.payPeriod.periodStartOn, { year: true })} to{" "}
          {formatLocalDate(timesheet.payPeriod.periodEndOn, { year: true })} ·{" "}
          {timesheet.payPeriod.payGroupName}
        </p>
        {zoneNotice ? <p className="text-xs text-muted-foreground">{zoneNotice}</p> : null}
      </header>

      {timesheet.recomputedSinceApproval ? (
        <RecomputedBanner recomputed={timesheet.recomputedSinceApproval} audience="manager" />
      ) : null}

      {timesheet.dispute ? (
        <DisagreementBlock
          dispute={timesheet.dispute}
          computedTotalHours={timesheet.periodTotals.totalHours}
          rowState={timesheet.rowState}
        />
      ) : null}

      <ExceptionsStrip
        exceptions={timesheet.openExceptions}
        queueHref={hrTimeExceptionsHref(undefined, { employment: timesheet.employmentId })}
        mockCase={mockCase}
        onResolved={onChanged}
      />

      <DecisionBar timesheet={timesheet} mockCase={mockCase} onDecided={onChanged} />

      <TimesheetWeeks timesheet={timesheet} viewer="manager" />

      <EditHistoryPanel timesheet={timesheet} />

      {/* AFTER LOCK: the edit is ABSENT, and the correct lane is offered in its place. */}
      {locked ? (
        <section className="rounded-lg border border-border bg-muted/40 p-4">
          <h2 className="text-sm font-semibold">This pay period is closed</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Punches cannot be corrected here any more. A correction now becomes an adjustment that
            rides the next payroll run and stays tagged to this period — the closed period is never
            rewritten, and a delivered export is never regenerated, because regenerating in place
            double-pays.
          </p>
          <Link
            href={hrTimePeriodHref(timesheet.payPeriod.id)}
            className="mt-2 inline-flex text-sm font-medium underline underline-offset-4"
          >
            Open the pay period to record an adjustment
          </Link>
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Correcting a punch</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open the raw punch register to void and replace a punch. A punch is never edited, a
            reason is always required, and the employee is always told what changed and why.
          </p>
          <Link
            href={hrPunchesHref(undefined, { employment: timesheet.employmentId })}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
          >
            <PencilLine className="h-4 w-4" aria-hidden />
            Open this person&rsquo;s punches
          </Link>
        </section>
      )}

      <AssistStrip surfaceName="matrx-user/hr-time" />
    </>
  );
}

/** Approve or reject THIS timecard. Never the period — that is a separate deliberate act. */
function DecisionBar({
  timesheet,
  mockCase,
  onDecided,
}: {
  timesheet: Timesheet;
  mockCase: ReturnType<typeof useHrMockCase>;
  onDecided: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // The step id lives on the workflow, and `timesheet.attestation.stepId` is the ATTESTATION step —
  // never the approval one. Without an approval step id from `hr_wf_for_target`, this surface says
  // so rather than firing a decision at the wrong step.
  const stepId = timesheet.attestation.stepId;
  const decidable =
    stepId !== null &&
    (timesheet.rowState === "attested" ||
      timesheet.rowState === "disputed" ||
      timesheet.rowState === "open");

  async function decide(decision: "approve" | "reject", why: string | null) {
    if (!stepId) return;
    setBusy(true);
    setError(null);
    try {
      await decideWorkflowStep(stepId, decision, why, {}, { mockCase });
      toast.success(decision === "approve" ? "Timecard approved." : "Timecard sent back.");
      setRejecting(false);
      setReason("");
      onDecided();
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold">This timecard</h2>
        <span className="text-xs text-muted-foreground">
          Deciding this one person does not move the pay period.
        </span>
      </div>

      <RefusalNotice error={error} className="mt-3" />

      {timesheet.dispute ? (
        <p className="mt-2 rounded-md border border-orange-500/40 bg-orange-500/5 px-2.5 py-2 text-xs">
          You are approving over a recorded disagreement. That is allowed and it is recorded — the
          employee&rsquo;s words stay on this timecard through export and lock.
        </p>
      ) : null}

      {timesheet.openExceptions.length > 0 ? (
        <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-xs">
          There are open exceptions on this period. Resolve each one, or waive it with a written
          reason, before approving.
        </p>
      ) : null}

      {rejecting ? (
        <div className="mt-3 space-y-2">
          <label htmlFor="reject-reason" className="block text-sm font-medium">
            Why is this going back? A reason is required, and the employee sees it.
          </label>
          <Textarea
            id="reject-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || reason.trim().length < MIN_REASON_LENGTH}
              onClick={() => void decide("reject", reason.trim())}
            >
              Send it back
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setRejecting(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : decidable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void decide("approve", null)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
            Approve this timecard
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            <Undo2 className="mr-1.5 h-4 w-4" aria-hidden />
            Send it back
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          There is no open decision on this timecard right now.
        </p>
      )}
    </section>
  );
}

/** L3-54 — edit history with the reason, the original value, and the rate at the time. */
function EditHistoryPanel({ timesheet }: { timesheet: Timesheet }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">What has been changed</h2>
      {timesheet.editHistory.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing on this timecard has been changed by a person.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">When</th>
                <th className="py-1.5 pr-3 font-medium">Who</th>
                <th className="py-1.5 pr-3 font-medium">What</th>
                <th className="py-1.5 pr-3 font-medium">Was</th>
                <th className="py-1.5 pr-3 font-medium">Became</th>
                <th className="py-1.5 pr-3 font-medium">Rate at the time</th>
                <th className="py-1.5 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {timesheet.editHistory.map((entry, index) => (
                <tr key={`${entry.at}-${index}`} className="border-b border-border/60 align-top">
                  <td className="py-1.5 pr-3">
                    {formatDateTimeInTz(entry.at, viewerTimeZone())}
                  </td>
                  <td className="py-1.5 pr-3">{entry.byName}</td>
                  <td className="py-1.5 pr-3">{entry.field.replace(/_/g, " ")}</td>
                  <td className="py-1.5 pr-3 line-through decoration-2">
                    {entry.originalValue ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3">{entry.newValue ?? "—"}</td>
                  {/* The rate AT THE TIME — not today's rate, which is a different number. */}
                  <td className="py-1.5 pr-3 tabular-nums">{formatRate(entry.rateAtTime)}</td>
                  <td className="py-1.5">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Total for this period as it stands: {formatHours(timesheet.periodTotals.totalHours)} hours.
      </p>
    </section>
  );
}
