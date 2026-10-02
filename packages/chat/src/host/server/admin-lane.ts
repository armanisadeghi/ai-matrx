/**
 * Server seam (P9) — the admin seat (platform work billed to the platform tenant). Same names the call sites imported from the
 * host's `lib/api/admin-lane`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const adminLaneOrganizationId = forwardServer("adminLaneOrganizationId");
export const adminLaneHeadersFor = forwardServer("adminLaneHeadersFor");
