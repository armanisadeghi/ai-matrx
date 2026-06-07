"use client";

/**
 * useOrgResourceInventory
 * -----------------------
 * Owned + shared counts for every org resource catalogue entry. Thin wrapper
 * over the generalized `useContainerInventory` (column = "organization_id"),
 * which also runs the org-only "shared-with-org" (permissions) pass.
 *
 * Add an entry to `resource-catalogue.ts` and it's counted here automatically.
 */

import {
  useContainerInventory,
  type ContainerInventory,
} from "./useContainerInventory";

export type OrgResourceInventory = ContainerInventory;

export function useOrgResourceInventory(
  orgId: string | null | undefined,
): OrgResourceInventory {
  return useContainerInventory({ column: "organization_id", value: orgId });
}
