// Route 14 — `/hr/people/[employeeId]/[tab]` (SPEC-UI-IA §3.2 row 14, §4;
// SPEC-EMPLOYEES §2.3).
//
// 🚨 TABS ARE ROUTES. That is what makes them deep-linkable and new-tab-able,
// and it is why the profile's tab bar is `<Link>`s rather than local state: a
// manager sending "look at their job history" has to be able to send a URL that
// lands on it.
//
// The static `c/` segment beside this dynamic one owns custom tabs, and Next
// resolves a static segment first — so `/hr/people/<id>/c/expenses` reaches the
// custom-tab route and never this one with `tab="c"`.

import { Suspense } from "react";

import { EmployeeProfile } from "@/features/hr/people/profile/EmployeeProfile";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "Employee" };

export default async function HrEmployeeTabPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string; tab: string }>;
  searchParams: Promise<{ assignment?: string; as_of?: string }>;
}) {
  const { employeeId, tab } = await params;
  const query = await searchParams;

  return (
    <Suspense fallback={<HrLoading variant="profile" />}>
      <EmployeeProfile
        employeeId={employeeId}
        tab={tab}
        assignmentParam={query.assignment ?? null}
        asOf={query.as_of ?? null}
      />
    </Suspense>
  );
}
