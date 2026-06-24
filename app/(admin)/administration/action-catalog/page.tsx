import { ActionCatalogClient } from "@/features/action-catalog/components/ActionCatalogClient";

/**
 * Admin Action Catalog — the live noun × verb grid + build/test panel.
 *
 * Gating: the `(admin)` route group layout already enforces super-admin (server
 * side). `ActionCatalogClient` carries the single, documented in-page admin gate
 * (any admin level) that can later be lowered to org-level admins.
 */
export default function ActionCatalogPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <ActionCatalogClient />
    </div>
  );
}
