/**
 * Server seam (P9) — the Matrx browser extension. Same names the call sites imported from the
 * host's `lib/extension-bridge/matrx-extend-client`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const invokeMatrxExtendTool = forwardServer("invokeMatrxExtendTool");
