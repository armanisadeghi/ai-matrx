"use client";

/**
 * features/hr/time/timesheet/MyTimesheet.tsx — ROUTE 5, `/hr/me/timesheet` (L3-49, L3-50, L3-59,
 * L3-64, L3-77).
 *
 * The employee's own current-period timesheet: the place they attest, or record that they disagree
 * in words nobody can later edit.
 *
 * 🚨 `no-timesheet` IS AN EXPLICIT SENTENCE, NOT AN EMPTY GRID (§2.2). A salaried-exempt employee
 * who opens this route must read *why* there is nothing here. `noTimesheetReason` is the server's
 * sentence and it is printed, not summarised — an empty table teaches someone that the product is
 * broken.
 *
 * 🚨 THIS ROUTE IS SELF-ONLY BY CONSTRUCTION (§2.2). There is no employee selector, no "view as",
 * and no manager mode. A manager reviewing a report uses route 29, where the attestation control is
 * absent for everyone but the subject.
 *
 * MOBILE-FIRST (L3-77 / UI-IA §7). Employees read this on a phone, months before any native app:
 * single column at 375px, ≥44px targets on the attest controls, and nothing that needs a sideways
 * scroll of the page body.
 */

import Link from "next/link";

import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { cn } from "@/lib/utils";

import { getTimesheet } from "../api/service";
import type { Timesheet } from "../api/types";
import { DisagreementBlock } from "../shared/DisagreementBlock";
import { ExceptionSentenceList } from "../shared/ExceptionDoor";
import { HrTimeReadState } from "../shared/RefusalNotice";
import { RuleSnapshotProvider } from "../shared/RuleSnapshot";
import { useHrMockCase, useHrTimeQuery } from "../shared/useHrTimeQuery";
import { crossZoneNotice } from "../shared/format";
import { AttestationBar } from "./AttestationBar";
import { RecomputedBanner } from "./RecomputedBanner";
import { TimesheetWeeks } from "./WeekBlocks";

export function MyTimesheet({
  employmentId,
  payPeriodId,
}: {
  employmentId: string | null;
  payPeriodId: string | null;
}) {
  const mockCase = useHrMockCase();
  const ready = Boolean(employmentId && payPeriodId);

  const query = useHrTimeQuery<Timesheet>(
    (signal) => getTimesheet(employmentId as string, payPeriodId as string, { mockCase, signal }),
    [employmentId, payPeriodId, mockCase],
    ready,
  );

  if (!ready) return <UnresolvedContext />;

  return (
    <RuleSnapshotProvider>
      <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-4 sm:px-4">
        <HrTimeReadState loading={query.loading} error={query.error}>
          {query.data ? <MyTimesheetBody timesheet={query.data} mockCase={mockCase} onRefetch={query.refetch} /> : null}
        </HrTimeReadState>
      </div>
    </RuleSnapshotProvider>
  );
}

function MyTimesheetBody({
  timesheet,
  mockCase,
  onRefetch,
}: {
  timesheet: Timesheet;
  mockCase: ReturnType<typeof useHrMockCase>;
  onRefetch: () => void;
}) {
  // §2.2's `no-timesheet` state. It comes FIRST: everything below assumes there are hours.
  if (timesheet.noTimesheetReason) {
    return (
      <section className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-base font-semibold">No timesheet for this pay period</h1>
        <p className="mt-2 text-sm text-muted-foreground">{timesheet.noTimesheetReason}</p>
        <p className="mt-3 text-sm">
          If you think that is wrong, tell your manager or HR — they can check how your position is
          set up.
        </p>
        <Link
          href="/hr/tasks"
          className="mt-3 inline-flex text-sm font-medium underline underline-offset-4"
        >
          Open your HR tasks
        </Link>
      </section>
    );
  }

  const zoneNotice = timesheet.weeks[0]?.days[0]
    ? crossZoneNotice(timesheet.weeks[0].days[0].tz)
    : null;

  return (
    <>
      {/*
       * No title here on purpose. `<PageHeader>` already carries "My timesheet" in the shell's
       * header zone; repeating it in the body is the faux in-body header the `core-route-headers`
       * skill names as failure class 1. What the body owes the reader is the sentence that changes
       * how they read the numbers, not the page's own name.
       */}
      <header className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Every figure here was calculated by the payroll engine, not by this page. Open any
          overtime or premium number to see exactly which rule produced it.
        </p>
        {zoneNotice ? <p className="text-xs text-muted-foreground">{zoneNotice}</p> : null}
      </header>

      {timesheet.recomputedSinceApproval ? (
        <RecomputedBanner recomputed={timesheet.recomputedSinceApproval} audience="employee" />
      ) : null}

      {/* The disagreement, if one exists, sits ABOVE the hours — it is the most important fact on
          the page and it survives approval, export and lock. */}
      {timesheet.dispute ? (
        <DisagreementBlock
          dispute={timesheet.dispute}
          computedTotalHours={timesheet.periodTotals.totalHours}
          rowState={timesheet.rowState}
        />
      ) : null}

      <AttestationBar timesheet={timesheet} mockCase={mockCase} onDecided={onRefetch} />

      <TimesheetWeeks timesheet={timesheet} viewer="employee" />

      {timesheet.openExceptions.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Things flagged on this pay period</h2>
          <p className="text-xs text-muted-foreground">
            Your manager resolves these. You can add a comment from your HR tasks.
          </p>
          {/* An employee reading "no meal break was provided" must be able to open the record
              of it — read-only for them, but reachable. */}
          <ExceptionSentenceList exceptions={timesheet.openExceptions} className="mt-2" />
        </section>
      ) : null}

      {/* Assists are the platform's ONE chip path. Nothing here is an AI figure: SPEC-TIME §11's
          standing prohibition is that no Mandate computes money, hours, accrual or a deadline. */}
      <AssistStrip surfaceName="matrx-user/hr-time" />
    </>
  );
}

/**
 * ⚠️ THE HONEST STATE FOR AN UNRESOLVED CONTEXT, AND A NAMED DEBT.
 *
 * SPEC-TIME §2.2's data line is `hr.timesheet_get(self, current_period)`, but the live contract is
 * `public.hr_timesheet_get(p_employment_id uuid, p_pay_period_id uuid)` — two concrete ids, with no
 * self/current resolution. `public.hr_my_context(p_organization_id)` exists live and is the natural
 * source for the employment, and the current period comes from the pay group; **both reads belong
 * to lanes L1 and the periods lane, not to this one.** Rather than guess a uuid or render a blank
 * grid, this route says what it is missing and gives the reader somewhere to go.
 */
function UnresolvedContext({ className }: { className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-5xl px-3 py-4 sm:px-4", className)}>
      <section className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-base font-semibold">We could not work out which timesheet is yours</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page needs to know your employment and the pay period you are in. That link is not
          wired up yet, so nothing is shown rather than the wrong person&rsquo;s hours.
        </p>
        <Link
          href="/hr/me"
          className="mt-3 inline-flex text-sm font-medium underline underline-offset-4"
        >
          Open my HR profile
        </Link>
      </section>
    </div>
  );
}
