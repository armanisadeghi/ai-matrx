// `/hr/hiring` — SPEC-UI-IA routes 18–26, and NOT BUILT YET.
//
// This file exists so the nav item and the home card that have always pointed
// here stop being 404s. It renders the registered promise `hr.hiring`;
// the whole reasoning, and what the owning lane must do when it arrives, is in
// `features/hr/shared/HrPillarSurface.tsx`. Do not restate it here.

import { HrPillarSurface } from "@/features/hr/shared/HrPillarSurface";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/hiring", {
  title: "Hiring",
  description: "Requisitions, candidates, interviews and offers.",
});

export default function HrHiringPage() {
  return (
    <HrPillarSurface promiseKey="hr.hiring" owner="Hiring" />
  );
}
