/**
 * `launch_agent` — accepting the assist opens the shared agent-run window,
 * pre-filled with the composed intent (pre-fill only; the user reviews and
 * sends). The agent comes from a direct id or an agent-slot key resolved at
 * click time (swappable from /agents/slots, no deploy).
 */

import { resolveAgentSlot } from "@/features/agents/slots/service";
import {
  registerAssistAction,
  type AssistActionResult,
} from "../assist-action-registry";

registerAssistAction({
  kind: "launch_agent",
  description:
    "Open the floating agent-run window pre-filled with the assist's intent (agentId or slotKey).",
  handler: async (assist, ctx): Promise<AssistActionResult> => {
    if (assist.action.kind !== "launch_agent") {
      return { ok: false, error: "launch_agent: wrong action payload" };
    }
    const { agentId, slotKey, agentName, draftText } = assist.action;
    let resolvedAgentId = agentId ?? null;
    if (!resolvedAgentId && slotKey) {
      const resolved = await resolveAgentSlot(slotKey);
      resolvedAgentId = resolved.agentId;
    }
    if (!resolvedAgentId) {
      return {
        ok: false,
        error: "launch_agent: assist carries neither agentId nor slotKey",
      };
    }
    ctx.openAgentRun({
      initialAgentId: resolvedAgentId,
      initialAgentName: agentName ?? null,
      initialDraftText: draftText ?? null,
    });
    return { ok: true, result: { agentId: resolvedAgentId } };
  },
});
