/**
 * Server seam (P9) — a matrx-local engine on this machine. Same names the call sites imported from the
 * host's `lib/local-engine/discovery`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const discoverLocalEngine = forwardServer("discoverLocalEngine");
export const getCachedLocalEngine = forwardServer("getCachedLocalEngine");
export const supportsLocalAgentExecution = forwardServer("supportsLocalAgentExecution");
