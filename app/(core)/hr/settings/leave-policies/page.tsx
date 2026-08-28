import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { LeavePolicyListSurface } from "@/features/hr/leave/policies/LeavePolicyListSurface";

/**
 * Route 74 (SPEC-UI-IA §3.11, SPEC-LEAVE §2.1) — the leave policy list.
 *
 * No `PageHeader`: `HrSettingsChrome` in the section layout injects the header, owns the
 * route-tab bar, and runs the employer / module / activation / HR-admin gates. A page-level
 * copy of any of them would be a second gate that can disagree with the first.
 */
export const metadata = { title: "Leave policies" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="table" rows={6} />}>
      <LeavePolicyListSurface />
    </Suspense>
  );
}
