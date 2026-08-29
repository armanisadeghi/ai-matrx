import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { LeaveEnrollmentSurface } from "@/features/hr/leave/policies/LeaveEnrollmentSurface";
import { notFound } from "next/navigation";
import { isFullUuid } from "@/utils/supabase-search";

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

  // 🚨 A MALFORMED ID IN THE URL IS REFUSED HERE, BEFORE ANY READ. Postgres casts
  // the route text to `uuid` inside the door and raises `22P02`, which reached the
  // person as a sentence about a value in the wrong format — on a READ, with no
  // form on screen and nothing to save (D11). The three `/hr/people/[employeeId]`
  // routes were guarded on 2026-08-28; the other nine dynamic HR routes were not.
  if (!isFullUuid(policyId)) notFound();
  return (
    <Suspense fallback={<HrLoading variant="table" rows={6} />}>
      <LeaveEnrollmentSurface policyId={policyId} />
    </Suspense>
  );
}
