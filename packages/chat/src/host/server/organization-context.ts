/**
 * Server seam (P9) — the `X-Organization-Id` header (with the host's admin-lane header). Same names the call sites imported from the
 * host's `lib/api/organization-context`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const applyOrganizationContextHeader = forwardServer("applyOrganizationContextHeader");
