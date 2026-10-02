/**
 * Server seam (P9) — the contract-typed REST verbs. Same names the call sites imported from the
 * host's `lib/api/typed-client`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const apiGet = forwardServer("apiGet");
export const apiPost = forwardServer("apiPost");
export const apiPatch = forwardServer("apiPatch");
export const buildPath = forwardServer("buildPath");
