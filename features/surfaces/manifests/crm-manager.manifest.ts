/**
 * Surface manifest — CRM Manager window (`matrx-user/crm-manager`).
 *
 * The floating manager is the route's full list experience in WindowPanel
 * chrome, so it inherits the route vocabulary and emits the same scope.
 *
 * It also gets the route's WRITE targets, by re-export rather than by
 * inheritance: `inheritsFrom` carries read values, but the writeback runtime
 * resolves targets per-manifest (`findDeclaredTarget` reads
 * `getManifest(name).writeTargets` with no chain walk), so a window mount
 * carrying no `writeTargets` of its own would be offered no write tool at
 * all. The same `CrmListPage` component renders both mounts with the same
 * state, the same setters and the same registered handlers — only
 * `surfaceName` differs — so the contract is genuinely identical and sharing
 * the array is what keeps it that way. See the WRITE DOCTRINE block in
 * `crm.manifest.ts` for what earned a target and what did not.
 */

import type { SurfaceManifest } from "@/features/surfaces/types";
import {
  CRM_SURFACE_NAME,
  crmGroups,
  crmWriteTargets,
} from "./crm.manifest";

export const CRM_MANAGER_SURFACE_NAME = "matrx-user/crm-manager";

export const crmManagerManifest: SurfaceManifest = {
  surfaceName: CRM_MANAGER_SURFACE_NAME,
  readiness: "verified",
  overlayId: "crmManagerWindow",
  label: "CRM Manager",
  inheritsFrom: CRM_SURFACE_NAME,
  intro: `<surface_intro>
You are in the floating CRM Manager window. It is the same scoped people-and-companies manager as the /crm route, available without leaving the user's current workspace. All inherited CRM values describe the live list inside this window.

The same four write targets are available here as on the route — search_query, party_kind_filter, column_filters and list_sort shape which records this window shows. Everything the route refuses, this window refuses too: no creating, deleting, restoring or merging a party, and no changing the browsed scope. The visible-record values were captured when this run started and go stale the moment any of those writes lands, so after filtering describe what you asked for rather than which records are now on screen.
</surface_intro>`,
  // Read values are inherited; the groups are re-declared because the write
  // targets below reference one and group declarations do not cross
  // `inheritsFrom`.
  groups: crmGroups,
  values: [],
  writeTargets: crmWriteTargets,
  skipBaselineValues: true,
};
