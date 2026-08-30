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

import { useRouter } from "next/navigation";
import Link from "next/link";

import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { hrMeTimesheetHref, hrTasksHref } from "@/features/hr/routes";
import { useHrContext } from "@/features/hr/shared/useHrContext";

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
  periodNote = null,
  focusNote = null,
  focusPunchId = null,
  focusLocalWorkDate = null,
}: {
  employmentId: string;
  payPeriodId: string;
  /**
   * Set only when the resolved period is NOT the one containing today — `hr.my_timesheet_context`
   * returns `basis: 'most_recent'` with this sentence. Rendered verbatim above the hours, because
   * showing a closed period silently as "your timesheet" is a lie of omission.
   */
  periodNote?: string | null;
  /**
   * The other half of the same honesty: `hr.my_timesheet_context` resolved a `?punch=` deep link
   * and this is what the reader must be told about it — which period they are looking at and why,
   * or that the punch could not be found. SAME CLASS OF SENTENCE AS `periodNote`, so it gets the
   * same treatment and not a second visual language.
   */
  focusNote?: string | null;
  /** The corrected punch, marked in the raw chain. Never printed — it is a uuid. */
  focusPunchId?: string | null;
  /** The day that opens itself, scrolls into view and carries the accent. */
  focusLocalWorkDate?: string | null;
}) {
  const mockCase = useHrMockCase();

  const query = useHrTimeQuery<Timesheet>(
    // The live envelope is structurally different from `types.ts`; `fromLiveTimesheet` is the seam.
    (signal) => getTimesheet(employmentId, payPeriodId, { mockCase, signal }),
    [employmentId, payPeriodId, mockCase],
    true,
  );

  return (
    <RuleSnapshotProvider>
      <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-4 sm:px-4">
        <HrTimeReadState loading={query.loading} error={query.error}>
          {query.data ? (
            <MyTimesheetBody
              timesheet={query.data}
              periodNote={periodNote}
              focusNote={focusNote}
              focusPunchId={focusPunchId}
              focusLocalWorkDate={focusLocalWorkDate}
              mockCase={mockCase}
              onRefetch={query.refetch}
            />
          ) : null}
        </HrTimeReadState>
      </div>
    </RuleSnapshotProvider>
  );
}

function MyTimesheetBody({
  timesheet,
  periodNote,
  focusNote,
  focusPunchId,
  focusLocalWorkDate,
  mockCase,
  onRefetch,
}: {
  timesheet: Timesheet;
  periodNote: string | null;
  focusNote: string | null;
  focusPunchId: string | null;
  focusLocalWorkDate: string | null;
  mockCase: ReturnType<typeof useHrMockCase>;
  onRefetch: () => void;
}) {
  const { orgRef } = useHrContext();
  const router = useRouter();

  /*
   * 🚨 THE VOIDING-PUNCH DOOR IS NOW A DOOR ON THIS ROUTE TOO. `PunchChain` renders every void
   * struck through with "Open the punch that replaced it" (§2.5: *"a hidden void is a destroyed
   * record"*), and route 5 simply never passed `onOpenPunch` — so an EMPLOYEE, the one person who
   * cannot open the raw punch register, fell through to a link into a manager surface.
   *
   * The in-place opener is the deep link this route already understands: re-ask with `?punch=`,
   * and `hr_my_timesheet_context` resolves the period that punch belongs to and the day to focus.
   * It deliberately carries neither `?employment=` nor `?period=` — pinning the old period would
   * defeat the resolution, and a replacement punch can legitimately land in a different one.
   * `replace`, not `push`: this is the same reading, re-aimed, not a new place to go back from.
   */
  const openPunch = (punchId: string) => {
    router.replace(hrMeTimesheetHref(orgRef, { punch: punchId }));
  };

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
        {/*
          ♻️ THE ORG TRAVELS ON THE LINK. `hrTasksHref(orgRef)` and never a hardcoded "/hr/tasks":
          HR is strictly single-employer and a link that drops `?org=` silently lands the person in
          a different employer (`features/hr/routes.ts`). Same org-dropping class as the "/hr/me"
          link this route used to carry.
        */}
        <Link
          href={hrTasksHref(orgRef)}
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
      {/*
        🚨 WHICH PERIOD THIS IS, WHEN IT IS NOT TODAY'S. `hr.my_timesheet_context` resolves the
        period containing today; when none does — a person whose last period closed yesterday — it
        returns the most recent one they were actually in, WITH this sentence. Rendering those hours
        without saying which week they are is the same class of defect as a bookable balance that
        cannot be booked.
      */}
      {periodNote ? (
        <p className="rounded-lg border border-border bg-card p-3 text-sm text-foreground">
          {periodNote}
        </p>
      ) : null}

      {/*
        🚨 WHAT THE LINK YOU FOLLOWED WAS ABOUT (SPEC-TIME §4.1). A punch-correction notice sends
        the employee here with `?punch=`; the route used to ignore it entirely and land on the most
        recent open period saying nothing, so a person told their punch had been changed arrived at
        a screen with no mention of it. `focusNote` is the server's sentence about that link —
        which period this is and why, or that the punch could not be found — and it is the SAME
        class of honest sentence as `periodNote` above, so it gets the same treatment. Two visual
        languages for one kind of fact is how a reader learns to skip both.
      */}
      {focusNote ? (
        <p className="rounded-lg border border-border bg-card p-3 text-sm text-foreground">
          {focusNote}
        </p>
      ) : null}

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

      <TimesheetWeeks
        timesheet={timesheet}
        viewer="employee"
        onOpenPunch={openPunch}
        focusPunchId={focusPunchId}
        focusLocalWorkDate={focusLocalWorkDate}
      />

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

/*
 * 🚨 THE DEBT THAT USED TO SIT HERE IS PAID, AND THE STATE IT EXCUSED IS DELETED.
 *
 * This file carried an `UnresolvedContext` that told every employee *"That link is not wired up
 * yet"* — including the ones whose hours were in the database — and a comment declaring the
 * self/current resolution to be "another lane's". Round 42 measured what that cost: route 5 was
 * dead for priya, punch and the contractor alike.
 *
 * `hr.my_timesheet_context` (`hr_c4_55`) is that resolution, and `features/hr/me/MyTimesheetContext`
 * is its one caller. It always hands this component two real ids, or renders the server's own
 * reason instead — so there is no unresolved arm left to render, and the props are no longer
 * nullable. A page must never tell a person the product is unfinished when the true answer is a
 * fact about their own record.
 */
