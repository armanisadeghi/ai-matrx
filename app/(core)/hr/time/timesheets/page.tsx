import { Suspense } from "react";

import { HrTimeShell } from "@/features/hr/time/HrTimeShell";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { PeriodApprovalGrid } from "@/features/hr/time/timesheet/PeriodApprovalGrid";

/**
 * Route 28 — `/hr/time/timesheets` (SPEC-UI-IA §3.4 row 28, §5.5; SPEC-TIME §6).
 *
 * The manager/HR approval grid for ONE pay group and period. Approving a row closes that
 * employment's step; it never moves the pay period — that is routes 32/33.
 *
 * This is where the "Time" nav item lands (route 27 redirects here), so it is the whole section's
 * first screen. No `PageHeader`: `HrTimeShell` → `HrSubShell` → `HrShell` injects the route header,
 * the HR nav, the employer switcher and the section's tab bar, and owns the scroll chain.
 */
export const metadata = { title: "Timesheets" };

export default async function TimesheetApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;

  return (
    <HrTimeShell title="Timesheets">
      <Suspense fallback={<HrLoading variant="table" rows={8} />}>
        <PeriodApprovalGrid payPeriodId={period ?? null} />
      </Suspense>
    </HrTimeShell>
  );
}
