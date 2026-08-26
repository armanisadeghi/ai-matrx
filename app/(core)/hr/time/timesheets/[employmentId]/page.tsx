import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
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
  searchParams: Promise<{ payPeriodId?: string }>;
}) {
  const { employmentId } = await params;
  const { payPeriodId } = await searchParams;

  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">Timesheet</h1>
      </PageHeader>
      <div className="h-full overflow-y-auto overflow-x-hidden">
        <Suspense
          fallback={
            <div className="h-full animate-pulse bg-card/40" aria-label="Loading the timesheet" />
          }
        >
          <EmploymentPeriodDetail
            employmentId={employmentId}
            payPeriodId={payPeriodId ?? null}
          />
        </Suspense>
      </div>
    </>
  );
}
