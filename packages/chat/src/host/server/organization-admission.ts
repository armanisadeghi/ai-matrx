/**
 * Server seam (P9) — the organization a server call is admitted under. Same names the call sites imported from the
 * host's `lib/api/organization-admission`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer, type ChatServerTypes } from "../server";

export const peekSelectedOrganizationId = forwardServer("peekSelectedOrganizationId");
export const waitForOrganizationAdmission = forwardServer("waitForOrganizationAdmission");

export type OrganizationAdmission = ChatServerTypes["OrganizationAdmission"];
