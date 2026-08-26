import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { PeriodApprovalGrid } from "@/features/hr/time/timesheet/PeriodApprovalGrid";

/**
 * Route 28 — `/hr/time/timesheets` (SPEC-UI-IA §3.4 row 28, §5.5; SPEC-TIME §6).
 *
 * The manager/HR approval grid for ONE pay group and period. Approving a row closes that
 * employment's step; it never moves the pay period — that is routes 32/33.
 */
export const metadata = { title: "Timesheets" };

export default async function TimesheetApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;

  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">Timesheets</h1>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <Suspense
          fallback={
            <div className="h-full animate-pulse bg-card/40" aria-label="Loading timesheets" />
          }
        >
          <PeriodApprovalGrid payPeriodId={period ?? null} />
        </Suspense>
      </div>
    </>
  );
}
