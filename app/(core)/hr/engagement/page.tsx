// `/hr/engagement` — SPEC-UI-IA route 64, and NOT BUILT YET.
//
// This file exists so the nav item and the home card that have always pointed
// here stop being 404s. It renders the registered promise `hr.engagement`;
// the whole reasoning, and what the owning lane must do when it arrives, is in
// `features/hr/shared/HrPillarSurface.tsx`. Do not restate it here.

import { HrPillarSurface } from "@/features/hr/shared/HrPillarSurface";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/engagement", {
  title: "Engagement",
  description: "Announcements, pulse surveys and recognition.",
});

export default function HrEngagementPage() {
  return (
    <HrPillarSurface promiseKey="hr.engagement" title="Engagement" owner="Engagement" />
  );
}
