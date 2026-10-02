/**
 * Server seam (P9) — the shared `@ai-matrx/agents/matrx` transport, bound to this host. Same names the call sites imported from the
 * host's `lib/api/matrx-transport`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer, type ChatServerTypes } from "../server";

export const createMatrxTransport = forwardServer("createMatrxTransport");
export const createMatrxTransportFromTarget = forwardServer("createMatrxTransportFromTarget");
export const cancelAgentRunRequest = forwardServer("cancelAgentRunRequest");

export type MatrxTransportOptions = ChatServerTypes["MatrxTransportOptions"];
