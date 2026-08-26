"use client";

/**
 * features/hr/time/timesheet/RawPunchesWindowBody.tsx — what opens beside the approval grid when a
 * manager asks "what is this figure actually made of?" (L3-51, SPEC-UI-IA §5.5).
 *
 * 🚨 IT IS THE RAW SIDE ONLY. The grid cell already carries the computed number; this window
 * carries the punches. Putting a total in here would conflate the two halves AD-11 keeps apart, in
 * the one place a reader is most likely to believe them equivalent.
 *
 * 🚨 IT WRAPS THE CANONICAL RENDERER. `PunchChain` is the component route 5, route 29 and route 30
 * all use — `features/window-panels/FEATURE.md` § A PANEL WRAPS THE CANONICAL COMPONENT. A bespoke
 * punch list in here would be a second renderer that drifts, and would be the copy that quietly
 * stopped rendering voids.
 */

import Link from "next/link";
import type { HrFixtureCase } from "@/features/hr/mock/transport";

import { getTimesheet } from "../api/service";
import type { Timesheet } from "../api/types";
import { formatLocalDate } from "../shared/format";
import { PunchChain } from "../shared/PunchChain";
import { HrTimeReadState } from "../shared/RefusalNotice";
import { useHrTimeQuery } from "../shared/useHrTimeQuery";

export function RawPunchesWindowBody({
  employmentId,
  payPeriodId,
  mockCase,
}: {
  employmentId: string;
  payPeriodId: string;
  mockCase?: HrFixtureCase;
}) {
  const query = useHrTimeQuery<Timesheet>(
    (signal) => getTimesheet(employmentId, payPeriodId, { mockCase, signal }),
    [employmentId, payPeriodId, mockCase],
  );

  const days = (query.data?.weeks ?? []).flatMap((week) => week.days);

  return (
    <div className="space-y-3 p-4">
      <HrTimeReadState loading={query.loading} error={query.error}>
        <>
          <p className="text-xs text-muted-foreground">
            Exactly what was recorded on the clock, in the time zone each punch was stamped in. No
            hours are calculated on this panel — the figure you clicked is on the grid.
          </p>

          {days.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No punches were recorded in this pay period.
            </p>
          ) : (
            days.map((day) => (
              <section key={day.localWorkDate} className="space-y-1.5">
                <h3 className="text-xs font-semibold">
                  {formatLocalDate(day.localWorkDate, { weekday: true, year: true })}
                </h3>
                <PunchChain punches={day.punches} />
              </section>
            ))
          )}

          <Link
            href={`/hr/time/timesheets/${employmentId}?payPeriodId=${payPeriodId}`}
            className="inline-flex text-xs font-medium underline underline-offset-4"
          >
            Open the full timesheet
          </Link>
        </>
      </HrTimeReadState>
    </div>
  );
}
