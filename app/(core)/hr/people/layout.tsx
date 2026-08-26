// app/(core)/hr/people/layout.tsx
//
// The People section shell (SPEC-UI-IA §3.2). `HrSubShell` = the HR context bar
// + persona nav + breadcrumb, plus this section's route-tab bar — which the
// SECTION LAYOUT owns, following the `administration/users` pattern, so every
// route under `/hr/people/*` gets the same bar without re-declaring it.
//
// It wraps the directory, the org chart, the create form AND the profile, which
// is why the profile's own twelve tabs are a second, inner strip: they belong to
// one record, not to the section.

import type { ReactNode } from "react";

import { HrPeopleShell } from "@/features/hr/people/HrPeopleShell";

export default function HrPeopleLayout({ children }: { children: ReactNode }) {
  return <HrPeopleShell>{children}</HrPeopleShell>;
}
