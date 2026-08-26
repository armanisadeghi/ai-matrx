// Route 11 — `/hr/people/org-chart` (SPEC-UI-IA §3.2 row 11, §5.2;
// SPEC-EMPLOYEES §2.2 route 11 / §5.2).
//
// Paired with the directory as a route tab — two views of one population.
// `?as_of=` and `?focus=` are real doors: a profile's "Show on the org chart"
// and a historical chart somebody shared both land here.

import { Suspense } from "react";

import { HrOrgChart } from "@/features/hr/people/org-chart/HrOrgChart";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "Org chart" };

export default function HrOrgChartPage() {
  return (
    <Suspense fallback={<HrLoading variant="panel" rows={8} />}>
      <HrOrgChart />
    </Suspense>
  );
}
