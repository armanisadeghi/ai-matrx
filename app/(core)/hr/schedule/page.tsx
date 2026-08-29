// `/hr/schedule` — SPEC-UI-IA routes 45–50, and NOT BUILT YET.
//
// This file exists so the nav item and the home card that have always pointed
// here stop being 404s. It renders the registered promise `hr.schedule`;
// the whole reasoning, and what the owning lane must do when it arrives, is in
// `features/hr/shared/HrPillarSurface.tsx`. Do not restate it here.

import { HrPillarSurface } from "@/features/hr/shared/HrPillarSurface";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/schedule", {
  title: "Schedule",
  description: "Build, publish and staff the shift schedule.",
});

export default function HrSchedulePage() {
  return (
    <HrPillarSurface promiseKey="hr.schedule" owner="Scheduling" />
  );
}
