/**
 * The fail-closed organization-context kernel MOVED into the published
 * package (`@ai-matrx/agents/matrx`, 0.6.0 — the C22 retrofit): one
 * implementation for every Matrx client transport, re-exported here so the
 * app's existing import sites (`callApi`, the transports, tests) keep their
 * path. Do not add kernel logic here — grow the package.
 *
 * The ONE host addition is the ADMIN LANE header (`lib/api/admin-lane.ts`):
 * whether a request comes from the admin section is a fact about THIS app's
 * routes, which the package cannot know. Every transport that binds the org
 * header through here also carries `x-matrx-admin-lane: 1` when it is bound to
 * the platform tenant from the admin section.
 */

import { applyOrganizationContextHeader as applyPackageOrganizationContextHeader } from "@ai-matrx/agents/matrx";
import { withAdminLaneHeader } from "@/lib/api/admin-lane";

export {
  assertQueryOrganizationMatchesContext,
  OrganizationContextError,
  requireOrganizationContext,
  type OrganizationContextErrorCode,
} from "@ai-matrx/agents/matrx";

export const applyOrganizationContextHeader: typeof applyPackageOrganizationContextHeader = (
  ...args: Parameters<typeof applyPackageOrganizationContextHeader>
) => withAdminLaneHeader(applyPackageOrganizationContextHeader(...args));
