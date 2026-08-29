// `/hr/assets` — SPEC-UI-IA route 63, and NOT BUILT YET.
//
// This file exists so the nav item and the home card that have always pointed
// here stop being 404s. It renders the registered promise `hr.assets`;
// the whole reasoning, and what the owning lane must do when it arrives, is in
// `features/hr/shared/HrPillarSurface.tsx`. Do not restate it here.

import { HrPillarSurface } from "@/features/hr/shared/HrPillarSurface";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/assets", {
  title: "Assets",
  description: "Equipment issued, assigned and recovered.",
});

export default function HrAssetsPage() {
  return (
    <HrPillarSurface promiseKey="hr.assets" owner="Assets" />
  );
}
