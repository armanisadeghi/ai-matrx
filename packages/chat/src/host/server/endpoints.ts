/**
 * Server seam (P9) — the server's production origin (an environment value the host owns). Same names the call sites imported from the
 * host's `lib/api/endpoints`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const productionUrl = forwardServer("productionUrl");
