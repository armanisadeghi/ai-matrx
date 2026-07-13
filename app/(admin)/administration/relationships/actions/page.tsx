// /administration/relationships/actions — the live noun × verb action grid +
// build/test panel, moved here from the retired /administration/action-catalog
// route (redirected).
//
// Gating: the `(admin)` route group layout already enforces super-admin (server
// side). `ActionCatalogClient` carries the single, documented in-page admin gate
// (any admin level) that can later be lowered to org-level admins.
//
// Height: h-full, NOT 100dvh — the hub layout already owns the viewport and
// subtracts the tab bar; a dvh calc here would double-count it.

import { ActionCatalogClient } from "@/features/action-catalog/components/ActionCatalogClient";

export const metadata = {
  title: "Action Catalog | Matrx Admin",
};

export default function ActionCatalogPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ActionCatalogClient />
    </div>
  );
}
