// Route 13 — `/hr/people/[employeeId]` (SPEC-UI-IA §3.2 row 13,
// SPEC-EMPLOYEES §2.2 routes 13/14).
//
// 🚨 A REDIRECT, NOT A PAGE. It sends the viewer to THE FIRST TAB THEY CAN SEE,
// which is `profile.tabs[0]` (honouring `hr.employees.profile_default_tab` only
// when that tab is in their set). A viewer with no access to Personal must never
// land on a blank page.
//
// The redirect is CLIENT-SIDE because the tab set is a per-viewer answer only
// `hr_employee_profile` can give, and that call is authenticated as the browser
// user. A server redirect would have to guess.

import { Suspense } from "react";

import { EmployeeProfileRedirect } from "@/features/hr/people/profile/EmployeeProfile";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "Employee" };

export default async function HrEmployeeRedirectPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;

  return (
    <Suspense fallback={<HrLoading variant="profile" />}>
      <EmployeeProfileRedirect employeeId={employeeId} />
    </Suspense>
  );
}
