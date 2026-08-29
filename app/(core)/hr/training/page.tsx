// `/hr/training` — SPEC-UI-IA routes 57–61, and NOT BUILT YET.
//
// This file exists so the nav item and the home card that have always pointed
// here stop being 404s. It renders the registered promise `hr.training`;
// the whole reasoning, and what the owning lane must do when it arrives, is in
// `features/hr/shared/HrPillarSurface.tsx`. Do not restate it here.

import { HrPillarSurface } from "@/features/hr/shared/HrPillarSurface";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/training", {
  title: "Training",
  description: "Assignments, certifications and compliance training.",
});

export default function HrTrainingPage() {
  return (
    <HrPillarSurface promiseKey="hr.training" owner="Training" />
  );
}
