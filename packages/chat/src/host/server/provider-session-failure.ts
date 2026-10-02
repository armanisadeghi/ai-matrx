/**
 * Server seam (P9) — browser-held provider session failures, reported through the server. Same names the call sites imported from the
 * host's `lib/api/provider-session-failure`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const reportBrowserProviderFailure = forwardServer("reportBrowserProviderFailure");
