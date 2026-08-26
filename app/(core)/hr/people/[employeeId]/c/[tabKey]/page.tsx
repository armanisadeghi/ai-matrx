// Route 14 (custom tabs) — `/hr/people/[employeeId]/c/[tabKey]` (§7.4,
// SPEC-UI-IA §4.3).
//
// Custom tabs render at the END of the tab bar, after Notes. A static `c`
// segment keeps them out of the built-in tab namespace, so an org that names a
// custom tab "notes" or "job" can never shadow a legally-required one.

import { Suspense } from "react";

import { EmployeeProfile } from "@/features/hr/people/profile/EmployeeProfile";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "Employee" };

export default async function HrEmployeeCustomTabPage({
  params,
}: {
  params: Promise<{ employeeId: string; tabKey: string }>;
}) {
  const { employeeId, tabKey } = await params;

  return (
    <Suspense fallback={<HrLoading variant="profile" />}>
      <EmployeeProfile employeeId={employeeId} tab={`c/${tabKey}`} />
    </Suspense>
  );
}
