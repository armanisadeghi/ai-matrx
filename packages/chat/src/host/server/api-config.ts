/**
 * Server seam (P9) — which server this page talks to, and its endpoint overrides. Same names the call sites imported from the
 * host's `lib/redux/slices/apiConfigSlice`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const selectResolvedBaseUrl = forwardServer("selectResolvedBaseUrl");
export const selectActiveServer = forwardServer("selectActiveServer");
export const selectActiveServerHealth = forwardServer("selectActiveServerHealth");
export const selectAiApiVersion = forwardServer("selectAiApiVersion");
export const selectApiVersion = forwardServer("selectApiVersion");
export const selectPathOverrides = forwardServer("selectPathOverrides");
export const selectEndpointOverrideConfig = forwardServer("selectEndpointOverrideConfig");
export const selectLoopbackTargetsAllowed = forwardServer("selectLoopbackTargetsAllowed");
export const switchServer = forwardServer("switchServer");
export const setAiApiVersion = forwardServer("setAiApiVersion");
export const setApiVersion = forwardServer("setApiVersion");
export const setPathOverride = forwardServer("setPathOverride");
export const clearApiOverrides = forwardServer("clearApiOverrides");
