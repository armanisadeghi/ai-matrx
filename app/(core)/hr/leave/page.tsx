import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { LeaveQueueSurface } from "@/features/hr/leave/manager/LeaveQueueSurface";

/**
 * Route 42 (SPEC-LEAVE §4.4) — the time-off decision surface.
 *
 * 🚨 THIS ROUTE CLOSES A LIVE DEAD END. `features/hr/shared/hr-nav.ts` has rendered a top-level
 * "Time Off" item resolving to `/hr/leave` since the nav shipped, and the route did not exist —
 * it 404'd for every persona that could see the item.
 *
 * No `PageHeader`: `LeaveDeskShell` → `HrSubShell` → `HrShell` injects the route header and the
 * section's tab bar, and owns the scroll chain.
 */
export const metadata = { title: "Time off" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="table" rows={8} />}>
      <LeaveQueueSurface />
    </Suspense>
  );
}
