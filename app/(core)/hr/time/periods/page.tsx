import { Suspense } from "react";

import { HrTimeShell } from "@/features/hr/time/HrTimeShell";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { createRouteMetadata } from "@/utils/route-metadata";
import { PayPeriodsPage } from "@/features/hr/time/periods/components/PayPeriodsPage";

/**
 * Route 32 — `/hr/time/periods` (SPEC-UI-IA §3.4). The pay-period state machine per pay group,
 * plus the org-wide export history that row 32 also names.
 *
 * Metadata goes through `createRouteMetadata` — the identifier `scripts/check-route-metadata.ts`
 * recognises. The tab-title rule is the SPECIFIC word first and the category last, so this reads
 * "Pay periods | Time": a payroll administrator with nine tabs open finds theirs by the first word.
 *
 * No `PageHeader`: `HrTimeShell` → `HrSubShell` → `HrShell` injects the route header, the HR nav,
 * the employer switcher and the section's tab bar, and owns the scroll chain. The switcher matters
 * most on this route of any in HR — these are payroll files, and HR is strictly single-employer.
 */
export const metadata = createRouteMetadata("/hr/time/periods", {
  titlePrefix: "Pay periods",
  title: "Time",
  description:
    "Every pay group's periods and where each one is in its lifecycle, with the payroll files this employer has produced.",
});

export default function HrTimePeriodsRoute() {
  return (
    <HrTimeShell title="Pay periods">
      <Suspense fallback={<HrLoading variant="table" rows={8} />}>
        <PayPeriodsPage />
      </Suspense>
    </HrTimeShell>
  );
}
