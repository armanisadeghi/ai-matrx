// `/hr/reports` — SPEC-UI-IA route 66, and NOT BUILT YET.
//
// This file exists so the nav item and the home card that have always pointed
// here stop being 404s. It renders the registered promise `hr.reports`;
// the whole reasoning, and what the owning lane must do when it arrives, is in
// `features/hr/shared/HrPillarSurface.tsx`. Do not restate it here.

import { HrPillarSurface } from "@/features/hr/shared/HrPillarSurface";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/reports", {
  title: "Reports",
  description: "Headcount, turnover, cost and compliance reporting.",
});

export default function HrReportsPage() {
  return (
    <HrPillarSurface promiseKey="hr.reports" title="Reports" owner="Reporting \& Analytics" />
  );
}
