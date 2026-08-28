import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { LeaveCalendarSurface } from "@/features/hr/leave/manager/LeaveCalendarSurface";

/**
 * Route 43 (SPEC-LEAVE §10) — the who's-out calendar.
 *
 * What each viewer sees on an entry is decided by `hr.leave_calendar`, not here: the disclosure
 * ladder is applied server-side and the surface renders what it is given.
 *
 * No `PageHeader` — `LeaveDeskShell` owns the section chrome.
 */
export const metadata = { title: "Who's out" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="cards" rows={6} />}>
      <LeaveCalendarSurface />
    </Suspense>
  );
}
