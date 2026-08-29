// `/hr/performance` — SPEC-UI-IA routes 62–64, and NOT BUILT YET.
//
// This file exists so the nav item and the home card that have always pointed
// here stop being 404s. It renders the registered promise `hr.performance`;
// the whole reasoning, and what the owning lane must do when it arrives, is in
// `features/hr/shared/HrPillarSurface.tsx`. Do not restate it here.

import { HrPillarSurface } from "@/features/hr/shared/HrPillarSurface";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/performance", {
  title: "Performance",
  description: "Review cycles and their outcomes.",
});

export default function HrPerformancePage() {
  return (
    <HrPillarSurface promiseKey="hr.performance" title="Performance" owner="Employee Performance Reviews" />
  );
}
