import { Suspense } from "react";

import { HrTimeShell } from "@/features/hr/time/HrTimeShell";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { EmploymentPeriodDetail } from "@/features/hr/time/timesheet/EmploymentPeriodDetail";

/**
 * Route 29 — `/hr/time/timesheets/[employmentId]` (SPEC-UI-IA §3.4 row 29, SPEC-TIME §2.4).
 *
 * One person's pay period in full. Approving here decides THIS timecard; the pay period moves on
 * routes 32/33 as a separate deliberate act (§6.4, §14 D7).
 */
export const metadata = { title: "Timesheet" };

export default async function EmploymentTimesheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ employmentId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { employmentId } = await params;
  const { period } = await searchParams;

  return (
    <HrTimeShell title="Timesheet">
      <Suspense fallback={<HrLoading variant="table" rows={8} />}>
        <EmploymentPeriodDetail
          employmentId={employmentId}
          payPeriodId={period ?? null}
        />
      </Suspense>
    </HrTimeShell>
  );
}
