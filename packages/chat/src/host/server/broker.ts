/**
 * Server seam (P9) — the credentials broker. Same names the call sites imported from the
 * host's `lib/api/broker/client`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const mintCredential = forwardServer("mintCredential");
