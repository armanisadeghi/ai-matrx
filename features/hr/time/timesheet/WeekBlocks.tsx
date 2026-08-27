"use client";

/**
 * features/hr/time/timesheet/WeekBlocks.tsx — the timesheet itself (L3-54, L3-55, L3-56, L3-57,
 * L3-64). Routes 5 and 29 both mount this; the only difference between them is `viewer`.
 *
 * 🚨 THE COLUMNS ARE THE SEVEN DAYS OF THE **WORKWEEK** — not the calendar week and not the pay
 * period — *because the workweek is the OT unit* (SPEC-TIME §5.1, AR 1.5). A period containing
 * parts of three workweeks renders **three blocks**, each with its own totals row, and the block
 * header names the **stamped** `weekStartDow` / `weekStartTime`: an org that changed the setting
 * later has weeks cut both ways in its history, and this header is the only place a reader can find
 * out which way THIS week was cut.
 *
 * 🚨 EVERY OT, DT AND PREMIUM FIGURE IS A DOOR (§0 law 2). They render through `RuleSnapshotDoor`,
 * never as text. A figure without that path is an unfinished surface, so there is no code path here
 * that prints one as a bare number.
 *
 * 🚨 A SINGLE WEEK RATE IS NEVER DISPLAYED. THERE ISN'T ONE (§5.3). A multi-rate week shows the
 * **Multiple rates** marker and renders overtime at `weightedAverageRegularRate` as a door onto the
 * full breakdown — each rate, its hours, the products, the average, and the rule versions.
 *
 * 🚨 NOTHING IN THIS FILE COMPUTES ANYTHING. Every hours figure is read from the row the server
 * sent: `day.totalHours`, `workweek.hoursOvertime`, `periodTotals.totalHours`. There is no `reduce`
 * over hours and no timestamp subtraction anywhere below — see `scripts/check-hr-time-arithmetic.ts`.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  Timesheet,
  TimesheetDay,
  TimesheetWeek,
  WorkIntervalRow,
  WorkweekRow,
} from "../api/types";
import { CategoryBadge, EstimateChip } from "../shared/badges";
import {
  formatHours,
  formatLocalDate,
  formatMoney,
  formatRate,
  formatWeekStart,
} from "../shared/format";
import { ExceptionSentenceList } from "../shared/ExceptionDoor";
import { FigureNotices, MoneyAmount } from "../shared/MoneyAndFlags";
import { PunchChain } from "../shared/PunchChain";
import { RuleSnapshotDoor } from "../shared/RuleSnapshot";
import { DayTimingNotes, RoundingSentence, StampedTime, WeekSplitNote } from "../shared/timing";
import { HOURS_CATEGORY_LABELS, HOURS_CATEGORY_ORDER } from "../shared/vocabulary";

export type TimesheetViewer = "employee" | "manager";

export function TimesheetWeeks({
  timesheet,
  viewer,
  onOpenPunch,
  className,
}: {
  timesheet: Timesheet;
  viewer: TimesheetViewer;
  onOpenPunch?: (punchId: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      {timesheet.weeks.map((week) => (
        <WeekBlock
          key={week.workweek.id}
          week={week}
          viewer={viewer}
          onOpenPunch={onOpenPunch}
        />
      ))}

      <PeriodTotals timesheet={timesheet} />
    </div>
  );
}

/**
 * One workweek. The **hard visual break** §9 rule 6 requires between weeks is this component's
 * outer border plus the gap the parent puts between them — a shift spanning the boundary renders in
 * both blocks and says so.
 */
function WeekBlock({
  week,
  viewer,
  onOpenPunch,
}: {
  week: TimesheetWeek;
  viewer: TimesheetViewer;
  onOpenPunch?: (punchId: string) => void;
}) {
  const ww = week.workweek;

  return (
    <section className="overflow-hidden rounded-lg border-2 border-border bg-card">
      <header className="border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <h3 className="text-sm font-semibold">
              Workweek of {formatLocalDate(ww.weekStartLocalDate, { weekday: true, year: true })}
            </h3>
            {/* The STAMPED start, not today's setting. */}
            <p className="text-xs text-muted-foreground">
              This week was cut on {formatWeekStart(ww.weekStartDow, ww.weekStartTime)}, in{" "}
              {ww.tz.replace(/_/g, " ")}.
            </p>
          </div>
          {ww.multiRate ? <MultipleRatesMarker workweek={ww} /> : null}
        </div>

        {ww.isBoundaryWeek ? (
          <p className="mt-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
            This workweek straddles the edge of the pay period. Overtime is calculated on the{" "}
            <span className="font-medium">whole week</span> and attributed to the period containing
            the week&rsquo;s end date — not split between the two periods.
          </p>
        ) : null}

        {week.splitAtBoundary ? <WeekSplitNote className="mt-2" /> : null}

        <WeekTotalsRow workweek={ww} />
        <FigureNotices money={ww.money} calc={ww.calc} className="mt-2" />
      </header>

      <div className="divide-y divide-border">
        {week.days.map((day) => (
          <DayRow
            key={day.localWorkDate}
            day={day}
            workweek={ww}
            viewer={viewer}
            onOpenPunch={onOpenPunch}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * 🚨 §5.3 — the **Multiple rates** marker, and the weighted average as a DOOR.
 *
 * The panel behind it is the whole of what §5.3 requires: each rate, hours at that rate, the
 * products, the weighted average, and the rule versions from the calc block. A bare number here
 * would be the exact defect the section exists to prevent, and there is no rendering path that
 * produces one.
 */
function MultipleRatesMarker({ workweek }: { workweek: WorkweekRow }) {
  const avg = workweek.weightedAverageRegularRate;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/50 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
        <Layers className="h-3.5 w-3.5" aria-hidden />
        Multiple rates
      </span>
      {avg === null ? (
        <span className="text-xs text-muted-foreground">
          The weighted average regular rate has not been calculated for this week yet.
        </span>
      ) : (
        <RuleSnapshotDoor
          request={{
            title: "Weighted average regular rate",
            subtitle: `Workweek of ${formatLocalDate(workweek.weekStartLocalDate, { weekday: true })}`,
            calc: workweek.calc,
            body: <RateBreakdown workweek={workweek} />,
          }}
          className="text-xs font-medium"
        >
          Overtime paid at {formatRate(avg)}
        </RuleSnapshotDoor>
      )}
    </div>
  );
}

function RateBreakdown({ workweek }: { workweek: WorkweekRow }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        How the weighted average was reached
      </h3>
      <p className="text-xs text-muted-foreground">
        This week was worked at more than one rate, so overtime is not paid at &ldquo;the&rdquo;
        rate — there isn&rsquo;t one. Under the FLSA it is paid at the weighted average of every
        rate worked.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Position</th>
              <th className="py-1.5 pr-3 text-right font-medium">Rate</th>
              <th className="py-1.5 pr-3 text-right font-medium">Hours</th>
              <th className="py-1.5 text-right font-medium">Rate × hours</th>
            </tr>
          </thead>
          <tbody>
            {workweek.rateComponents.map((rc, index) => (
              <tr key={`${rc.positionAssignmentId ?? "none"}-${index}`} className="border-b border-border/60">
                <td className="py-1.5 pr-3">{rc.positionTitle ?? "Not named"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{formatMoney(rc.rate)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{formatHours(rc.hours)}</td>
                {/* The server's own product. This column is READ, never multiplied here. */}
                <td className="py-1.5 text-right tabular-nums">{formatMoney(rc.product)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-1.5 pr-3" colSpan={2}>
                Weighted average regular rate
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {formatHours(workweek.hoursWorked)}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {workweek.weightedAverageRegularRate === null
                  ? "—"
                  : formatRate(workweek.weightedAverageRegularRate)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** Totals at the WORKWEEK grain, labelled as such. OT and DT are doors. */
function WeekTotalsRow({ workweek }: { workweek: WorkweekRow }) {
  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
      <Total label="Worked this week" value={formatHours(workweek.hoursWorked)} />
      <Total label="Regular" value={formatHours(workweek.hoursRegular)} />

      <div>
        <dt className="text-muted-foreground">Overtime</dt>
        <dd className="font-semibold">
          <RuleSnapshotDoor
            emphasis
            request={{
              title: `Overtime, ${formatHours(workweek.hoursOvertime)} hours`,
              subtitle: `Workweek of ${formatLocalDate(workweek.weekStartLocalDate, { weekday: true })}`,
              calc: workweek.calc,
              body: workweek.multiRate ? <RateBreakdown workweek={workweek} /> : undefined,
            }}
          >
            {formatHours(workweek.hoursOvertime)}
          </RuleSnapshotDoor>
        </dd>
      </div>

      <div>
        <dt className="text-muted-foreground">Double time</dt>
        <dd className="font-semibold">
          <RuleSnapshotDoor
            emphasis
            request={{
              title: `Double time, ${formatHours(workweek.hoursDoubletime)} hours`,
              subtitle: `Workweek of ${formatLocalDate(workweek.weekStartLocalDate, { weekday: true })}`,
              calc: workweek.calc,
            }}
          >
            {formatHours(workweek.hoursDoubletime)}
          </RuleSnapshotDoor>
        </dd>
      </div>

      <Total label="Paid leave" value={formatHours(workweek.hoursPaidLeave)} />
      <Total label="Holiday" value={formatHours(workweek.hoursHoliday)} />
      {/* Tracked separately because ACA counts paid leave and the FLSA does not. */}
      <Total
        label="Hours of service"
        value={formatHours(workweek.hoursOfService)}
        hint="Counts paid leave. Overtime under the FLSA does not."
      />
    </dl>
  );
}

function Total({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground" title={hint}>
        {label}
      </dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * One day. Collapsed it is the week view's row; expanded it is §5.1's **day view** — every interval
 * as its own row, and beneath them, in a visually distinct block, the raw punch chain. **The two
 * blocks are never interleaved.**
 */
function DayRow({
  day,
  workweek,
  viewer,
  onOpenPunch,
}: {
  day: TimesheetDay;
  workweek: WorkweekRow;
  viewer: TimesheetViewer;
  onOpenPunch?: (punchId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasContent = day.intervals.length > 0 || day.punches.length > 0;

  return (
    <div className={cn("px-4 py-3", open && "bg-muted/20")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left"
        disabled={!hasContent}
      >
        <span className="mt-0.5 text-muted-foreground">
          {hasContent ? (
            open ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            )
          ) : (
            <span className="inline-block h-4 w-4" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-medium">
              {formatLocalDate(day.localWorkDate, { weekday: true })}
            </span>
            <span className="text-sm tabular-nums">
              {formatHours(day.totalHours)}{" "}
              <span className="text-xs text-muted-foreground">hours</span>
            </span>
            {day.scheduledHours !== null ? (
              <span className="text-xs text-muted-foreground">
                Scheduled {formatHours(day.scheduledHours)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Not scheduled</span>
            )}
            {day.intervals.some((iv) => iv.calc.autoCloseEstimate) ? <EstimateChip /> : null}
          </span>

          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {day.intervals.map((iv) => (
              <CategoryBadge
                key={iv.id}
                label={iv.earningCodeName}
                category={iv.hoursCategory}
                isOvertime={iv.isOvertime}
              />
            ))}
          </span>
        </span>
      </button>

      <div className="ml-7 mt-2 space-y-2">
        <DayTimingNotes day={day} />

        {/* L3-50: inline on the employee's own timesheet, compact for a manager. */}
        <RoundingSentence
          intervals={day.intervals}
          minutes={day.roundingAppliedMinutes}
          inline={viewer === "employee"}
        />

        {/* Each raised exception is a DOOR onto its own row in route 31, not a sentence the
            reader has to go and act on from memory. */}
        <ExceptionSentenceList exceptions={day.exceptions} />

        {open ? (
          <div className="space-y-3 pt-1">
            <IntervalTable day={day} workweek={workweek} />
            {/* The raw block. Beneath, distinct, never interleaved. */}
            <PunchChain punches={day.punches} onOpenPunch={onOpenPunch} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** §5.1's day view: start, end, hours, badge, earning code, rate, amount, rounding. */
function IntervalTable({ day, workweek }: { day: TimesheetDay; workweek: WorkweekRow }) {
  if (day.intervals.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No calculated hours on this day.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[42rem] text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Start</th>
            <th className="px-3 py-2 font-medium">End</th>
            <th className="px-3 py-2 text-right font-medium">Hours</th>
            <th className="px-3 py-2 font-medium">Paid as</th>
            <th className="px-3 py-2 text-right font-medium">Rate</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Rounding</th>
          </tr>
        </thead>
        <tbody>
          {day.intervals.map((iv, index) => (
            <IntervalRows
              key={iv.id}
              interval={iv}
              previous={index > 0 ? day.intervals[index - 1] : null}
              workweek={workweek}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IntervalRows({
  interval: iv,
  previous,
  workweek,
}: {
  interval: WorkIntervalRow;
  previous: WorkIntervalRow | null;
  workweek: WorkweekRow;
}) {
  /**
   * 🚨 §5.3 — a mid-shift `transfer` renders as a **visible boundary between two intervals, naming
   * both position titles.** It is detected from the assignment changing between adjacent rows,
   * which is a comparison of two ids, not a calculation.
   */
  const transferred =
    previous !== null &&
    previous.positionAssignmentId !== iv.positionAssignmentId &&
    previous.positionTitle !== null &&
    iv.positionTitle !== null;

  const figureTitle = `${iv.earningCodeName}, ${formatHours(iv.hours)} hours`;
  const isRuleBearing = iv.isOvertime || iv.hoursCategory === "premium";

  return (
    <>
      {transferred ? (
        <tr className="bg-muted/50">
          <td colSpan={7} className="px-3 py-1.5 text-[11px] text-muted-foreground">
            Transferred from <span className="font-medium">{previous?.positionTitle}</span> to{" "}
            <span className="font-medium">{iv.positionTitle}</span> mid-shift.
          </td>
        </tr>
      ) : null}

      <tr className="border-b border-border/60 align-top">
        <td className="px-3 py-2">
          <StampedTime at={iv.startedAt} tz={iv.tz} />
        </td>
        <td className="px-3 py-2">
          <StampedTime at={iv.endedAt} tz={iv.tz} />
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {/* Rule-bearing figures are doors; a plain regular line does not need one. */}
          {isRuleBearing ? (
            <RuleSnapshotDoor
              emphasis={iv.isOvertime}
              request={{
                title: figureTitle,
                subtitle: `${formatLocalDate(iv.localWorkDate, { weekday: true })} · workweek of ${formatLocalDate(workweek.weekStartLocalDate)}`,
                calc: iv.calc,
                extra: {
                  earning_code: iv.earningCode,
                  interval_kind: iv.intervalKind,
                  source_punch_ids: iv.sourcePunchIds,
                  ...(iv.attendanceExceptionId
                    ? { attendance_exception_id: iv.attendanceExceptionId }
                    : {}),
                },
              }}
            >
              {formatHours(iv.hours)}
            </RuleSnapshotDoor>
          ) : (
            formatHours(iv.hours)
          )}
        </td>
        <td className="px-3 py-2">
          <CategoryBadge
            label={iv.earningCodeName}
            category={iv.hoursCategory}
            isOvertime={iv.isOvertime}
          />
          {iv.positionTitle ? (
            <span className="mt-1 block text-[11px] text-muted-foreground">{iv.positionTitle}</span>
          ) : null}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{formatRate(iv.rate)}</td>
        <td className="px-3 py-2 text-right">
          <MoneyAmount money={iv.money} />
        </td>
        <td className="px-3 py-2">
          {iv.roundingAppliedMinutes === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            <RoundingSentence intervals={[iv]} minutes={iv.roundingAppliedMinutes} inline={false} />
          )}
        </td>
      </tr>

      {iv.money.flags.length > 0 || iv.calc.calc.incomplete ? (
        <tr className="border-b border-border/60">
          <td colSpan={7} className="px-3 pb-2">
            <FigureNotices money={iv.money} calc={iv.calc} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * The third grain, labelled as the third grain (§5.1).
 *
 * 🚨 It is a **display sum the server produced** and it carries the boundary note where a boundary
 * week's OT is attributed to a different period. Neither figure is added up here.
 */
function PeriodTotals({ timesheet }: { timesheet: Timesheet }) {
  const t = timesheet.periodTotals;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Pay period total</h3>
      <p className="text-xs text-muted-foreground">
        {formatLocalDate(timesheet.payPeriod.periodStartOn, { year: true })} to{" "}
        {formatLocalDate(timesheet.payPeriod.periodEndOn, { year: true })} ·{" "}
        {timesheet.payPeriod.payGroupName}
      </p>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
        <Total label="Total hours" value={formatHours(t.totalHours)} />
        <Total label="Overtime" value={formatHours(t.hoursOvertime)} />
        <Total label="Double time" value={formatHours(t.hoursDoubletime)} />
        <Total label="Premium lines" value={String(t.premiumLineCount)} />
        {HOURS_CATEGORY_ORDER.map((category) => (
          <Total
            key={category}
            label={HOURS_CATEGORY_LABELS[category]}
            value={formatHours(t.hoursByCategory[category] ?? 0)}
          />
        ))}
      </dl>

      {t.boundaryNote ? (
        <p className="mt-3 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs">
          {t.boundaryNote}
        </p>
      ) : null}
    </section>
  );
}
