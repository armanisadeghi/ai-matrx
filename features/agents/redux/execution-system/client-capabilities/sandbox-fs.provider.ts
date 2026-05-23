/**
 * sandbox-fs capability — bound when the user has an active code-workspace
 * sandbox. The payload carries the orchestrator coordinates + a short-lived
 * scoped bearer token; the matrx-ai fs/shell tools detect it at runtime and
 * route into the container instead of running on the aidream host.
 *
 * Brings no tools online by itself — fs_read / fs_write / shell_exec etc.
 * are already in the agent's tool set when relevant; this envelope just
 * tells them where to execute.
 */

import { getActiveSandboxBinding } from "@/lib/sandbox/active-binding";
import { registerClientCapability } from "./registry";

registerClientCapability({
  name: "sandbox-fs",
  selectPayload: (state, conversationId) =>
    getActiveSandboxBinding(state, conversationId),
});
