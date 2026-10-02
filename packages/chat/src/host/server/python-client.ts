/**
 * Server seam (P9) — the plain JSON client, its base URL and access token. Same names the call sites imported from the
 * host's `lib/python-client`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const postJson = forwardServer("postJson");
export const getAccessTokenOrNull = forwardServer("getAccessTokenOrNull");
export const resolveBaseUrl = forwardServer("resolveBaseUrl");
