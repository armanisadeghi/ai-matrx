// app/(core)/marketing/[brandId]/planning/initiatives/page.tsx
//
// Initiatives — the container above channels — for this client.
//
// NOTE (agency restructure, 2026-08-29): `InitiativesListPage` is the canonical
// component the flat `/marketing/initiatives` route used and is mounted here
// unchanged. It is ORG-SCOPED, so it still lists every initiative in the active
// organization rather than only this brand's; scoping it to
// `useMarketingBrand()` is a component change, tracked in the restructure
// handoff.

import { InitiativesListPage } from "@/features/marketing/initiatives/InitiativesListPage";

export default function BrandInitiativesPage() {
  return <InitiativesListPage />;
}
