import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { LeaveEnrollmentSurface } from "@/features/hr/leave/policies/LeaveEnrollmentSurface";

/**
 * Route 74b (SPEC-LEAVE §2.8, §18 AR-6) — who is on this policy.
 *
 * Reached from the enrolled headcount on route 74, which SPEC-LEAVE §2.1 names as a door.
 * No `PageHeader` — `HrSettingsChrome` owns the section chrome and the gates.
 */
export const metadata = { title: "Policy enrolment" };

export default async function Page({
  params,
}: {
  params: Promise<{ policyId: string }>;
}) {
  const { policyId } = await params;
  return (
    <Suspense fallback={<HrLoading variant="table" rows={6} />}>
      <LeaveEnrollmentSurface policyId={policyId} />
    </Suspense>
  );
}
