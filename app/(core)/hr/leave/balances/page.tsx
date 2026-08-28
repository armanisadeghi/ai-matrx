import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { LeaveBalancesSurface } from "@/features/hr/leave/manager/LeaveBalancesSurface";

/**
 * Route 44 (SPEC-LEAVE §5.1) — leave balances, at the scope the server grants.
 *
 * No `PageHeader` — `LeaveDeskShell` owns the section chrome.
 */
export const metadata = { title: "Leave balances" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="table" rows={8} />}>
      <LeaveBalancesSurface />
    </Suspense>
  );
}
