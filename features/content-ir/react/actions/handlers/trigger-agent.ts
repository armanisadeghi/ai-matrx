/**
 * `trigger_agent` — the first registered kind action, and the reference shape
 * for every capability that follows.
 *
 * Fires an agent execution with variables mapped from the component's data,
 * reusing the exact launch path `KindAgentActionButton` proved out
 * (`launchAgent` → canonical execution pipeline, autoRun). The component names
 * the target agent and the variable values; the host launches as the viewing
 * user, so agent RLS applies and a launch the user can't perform fails loudly.
 *
 * Input contract (validated here — a malformed spec is a safe `{ ok:false }`,
 * never a throw into the component):
 *   { agentId: string; variables?: Record<string, unknown>;
 *     llmOverrides?: object; label?: string; displayMode?: string }
 */

import type { LLMParams } from "@/features/agents/types/agent-api-types";
import type {
  KindActionContext,
  KindActionResult,
} from "../kind-action-registry";
import { registerKindAction } from "../kind-action-registry";

interface TriggerAgentInput {
  agentId: string;
  variables?: Record<string, unknown>;
  llmOverrides?: Partial<LLMParams>;
  /** Overlay mode to launch in. Defaults to the visible chat overlay. */
  displayMode?: "modal-full" | "modal-compact" | "direct";
}

function parseInput(input: unknown): TriggerAgentInput | { error: string } {
  if (!input || typeof input !== "object") {
    return { error: "trigger_agent expects an object { agentId, variables }" };
  }
  const obj = input as Record<string, unknown>;
  const agentId = obj.agentId;
  if (typeof agentId !== "string" || !agentId.trim()) {
    return { error: "trigger_agent: agentId is required and must be a string" };
  }
  const variables =
    obj.variables && typeof obj.variables === "object"
      ? (obj.variables as Record<string, unknown>)
      : {};
  const displayMode =
    obj.displayMode === "direct" || obj.displayMode === "modal-compact"
      ? obj.displayMode
      : "modal-full";
  return {
    agentId,
    variables,
    llmOverrides:
      obj.llmOverrides && typeof obj.llmOverrides === "object"
        ? (obj.llmOverrides as Partial<LLMParams>)
        : undefined,
    displayMode,
  };
}

async function triggerAgentHandler(
  input: unknown,
  ctx: KindActionContext,
): Promise<KindActionResult> {
  const parsed = parseInput(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const result = await ctx.launchAgent(parsed.agentId, {
    surfaceKey: `kind-action:trigger_agent:${parsed.agentId}`,
    sourceFeature: "kind-action",
    config: {
      displayMode: parsed.displayMode,
      autoRun: true,
      ...(parsed.llmOverrides ? { llmOverrides: parsed.llmOverrides } : null),
    },
    runtime: { variables: parsed.variables ?? {} },
  });

  return { ok: true, result };
}

registerKindAction({
  key: "trigger_agent",
  description:
    "Launch an agent with variables mapped from this component's data (runs as the viewing user; agent access is enforced).",
  handler: triggerAgentHandler,
});
