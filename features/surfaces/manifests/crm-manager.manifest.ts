/**
 * Surface manifest — CRM Manager window (`matrx-user/crm-manager`).
 *
 * The floating manager is the route's full list experience in WindowPanel
 * chrome, so it inherits the route vocabulary and emits the same scope.
 */

import type { SurfaceManifest } from "@/features/surfaces/types";
import { CRM_SURFACE_NAME } from "./crm.manifest";

export const CRM_MANAGER_SURFACE_NAME = "matrx-user/crm-manager";

export const crmManagerManifest: SurfaceManifest = {
  surfaceName: CRM_MANAGER_SURFACE_NAME,
  readiness: "verified",
  overlayId: "crmManagerWindow",
  label: "CRM Manager",
  inheritsFrom: CRM_SURFACE_NAME,
  intro: `<surface_intro>
You are in the floating CRM Manager window. It is the same scoped people-and-companies manager as the /crm route, available without leaving the user's current workspace. All inherited CRM values describe the live list inside this window.
</surface_intro>`,
  values: [],
  skipBaselineValues: true,
};
