/**
 * `launch_agent` — accepting the assist opens the shared agent-run window,
 * pre-filled with the composed intent (pre-fill only; the user reviews and
 * sends). The agent comes from a direct id or an agent-mandate key resolved at
 * click time (swappable from /agents/mandates, no deploy).
 */

import { resolveMandate } from "@/features/agents/mandates/service";
import {
  registerAssistAction,
  type AssistActionResult,
} from "../assist-action-registry";

registerAssistAction({
  kind: "launch_agent",
  description:
    "Open the floating agent-run window pre-filled with the assist's intent (agentId or mandateKey).",
  handler: async (assist, ctx): Promise<AssistActionResult> => {
    if (assist.action.kind !== "launch_agent") {
      return { ok: false, error: "launch_agent: wrong action payload" };
    }
    const { agentId, mandateKey, agentName, draftText, variableValues } = assist.action;
    let resolvedAgentId = agentId ?? null;
    if (!resolvedAgentId && mandateKey) {
      const resolved = await resolveMandate(mandateKey);
      resolvedAgentId = resolved.agentId;
    }
    if (!resolvedAgentId) {
      return {
        ok: false,
        error: "launch_agent: assist carries neither agentId nor mandateKey",
      };
    }
    ctx.openAgentRun({
      initialAgentId: resolvedAgentId,
      initialAgentName: agentName ?? null,
      initialDraftText: draftText ?? null,
      initialVariableValues: variableValues ?? null,
    });
    return { ok: true, result: { agentId: resolvedAgentId } };
  },
});
