import { Suspense } from "react";

import { HrTimeShell } from "@/features/hr/time/HrTimeShell";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { createRouteMetadata } from "@/utils/route-metadata";
import { OvertimeQueuePage } from "@/features/hr/time/overtime/components/OvertimePages";

/**
 * Route 31a — `/hr/time/overtime` (SPEC-UI-IA §3.4, D24a).
 *
 * The pre-approval queue and the approaching-overtime watchlist. Unapproved overtime is still PAID:
 * it renders as flagged for review, never as unpaid or withheld.
 *
 * No `PageHeader`: `HrTimeShell` → `HrSubShell` → `HrShell` injects the route header, the HR nav,
 * the employer switcher and the section's tab bar, and owns the scroll chain.
 */
export const metadata = createRouteMetadata("/hr/time/overtime", {
  titlePrefix: "Overtime",
  title: "Time",
  description:
    "Overtime awaiting a decision, and who is close to crossing a threshold. Pre-approval decides whether overtime is worked, never whether it is paid.",
});

export default function HrTimeOvertimeRoute() {
  return (
    <HrTimeShell title="Overtime pre-approval">
      <Suspense fallback={<HrLoading variant="table" rows={8} />}>
        <OvertimeQueuePage />
      </Suspense>
    </HrTimeShell>
  );
}
