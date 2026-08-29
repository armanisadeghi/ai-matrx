// `/hr/onboarding` — SPEC-UI-IA routes 51–53, and NOT BUILT YET.
//
// This file exists so the nav item and the home card that have always pointed
// here stop being 404s. It renders the registered promise `hr.onboarding`;
// the whole reasoning, and what the owning lane must do when it arrives, is in
// `features/hr/shared/HrPillarSurface.tsx`. Do not restate it here.

import { HrPillarSurface } from "@/features/hr/shared/HrPillarSurface";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/onboarding", {
  title: "Onboarding",
  description: "New-hire runs, templates and offboarding.",
});

export default function HrOnboardingPage() {
  return (
    <HrPillarSurface promiseKey="hr.onboarding" title="Onboarding" owner="Onboarding \& Offboarding" />
  );
}
