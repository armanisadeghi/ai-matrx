// /administration/agents/relationships/directives — the live noun × verb Directive grid +
// build/test panel, moved here from the retired /administration/directive-catalog
// route (redirected).
//
// Gating: the `(admin)` route group layout already enforces super-admin (server
// side). `DirectiveCatalogClient` carries the single, documented in-page admin gate
// (any admin level) that can later be lowered to org-level admins.
//
// Height: h-full, NOT 100dvh — the hub layout already owns the viewport and
// subtracts the tab bar; a dvh calc here would double-count it.

import { DirectiveCatalogClient } from "@/features/directive-catalog/components/DirectiveCatalogClient";

export const metadata = {
  title: "Directive Catalog | Matrx Admin",
};

export default function DirectiveCatalogPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <DirectiveCatalogClient />
    </div>
  );
}
