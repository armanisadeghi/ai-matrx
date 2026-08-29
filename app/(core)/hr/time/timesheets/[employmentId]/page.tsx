import { Suspense } from "react";

import { HrTimeShell } from "@/features/hr/time/HrTimeShell";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { EmploymentPeriodDetail } from "@/features/hr/time/timesheet/EmploymentPeriodDetail";
import { notFound } from "next/navigation";
import { isFullUuid } from "@/utils/supabase-search";

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

  // 🚨 A MALFORMED ID IN THE URL IS REFUSED HERE, BEFORE ANY READ. Postgres casts
  // the route text to `uuid` inside the door and raises `22P02`, which reached the
  // person as a sentence about a value in the wrong format — on a READ, with no
  // form on screen and nothing to save (D11). The three `/hr/people/[employeeId]`
  // routes were guarded on 2026-08-28; the other nine dynamic HR routes were not.
  if (!isFullUuid(employmentId)) notFound();
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
