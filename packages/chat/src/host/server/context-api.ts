/**
 * Server seam (P9) — the context-state cold start. Same names the call sites imported from the
 * host's `lib/api/context-api`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const fetchContextState = forwardServer("fetchContextState");
