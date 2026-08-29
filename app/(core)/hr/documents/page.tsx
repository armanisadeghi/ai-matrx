// `/hr/documents` — SPEC-UI-IA routes 54–56, and NOT BUILT YET.
//
// This file exists so the nav item and the home card that have always pointed
// here stop being 404s. It renders the registered promise `hr.documents`;
// the whole reasoning, and what the owning lane must do when it arrives, is in
// `features/hr/shared/HrPillarSurface.tsx`. Do not restate it here.

import { HrPillarSurface } from "@/features/hr/shared/HrPillarSurface";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/documents", {
  title: "Documents",
  description: "The document library, acknowledgments and signatures.",
});

export default function HrDocumentsPage() {
  return (
    <HrPillarSurface promiseKey="hr.documents" title="Documents" owner="Documents \& Forms" />
  );
}
