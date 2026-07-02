// features/agents/agent-sets/orchestrator/thunks.ts
//
// Thunks for the "generate an orchestrator" flow. `runAgentDescriptionGenerator`
// runs the builtin Agent Description Generator HEADLESSLY (ephemeral, no persisted
// conversation) and returns the generated <agent> blocks. `syncOrchestratorPrompt`
// re-generates + re-injects so an orchestrator's <available_agents> never drifts
// from its set membership.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { isScopesRpcErr } from "@/features/scopes/types";
import { orchestratorService, extractAgentBlocks } from "./orchestratorService";
import { AGENT_DESCRIPTION_GENERATOR_ID, GENERATOR_INPUT_VAR } from "./constants";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export interface GeneratorResult {
  ok: boolean;
  xml?: string;
  error?: string;
}

/**
 * Dump the selected agents → run the Agent Description Generator headlessly →
 * return the cleaned <agent> blocks. Never throws.
 */
export function runAgentDescriptionGenerator(args: {
  memberIds: string[];
}): AppThunk<Promise<GeneratorResult>> {
  return async (dispatch) => {
    const dump = await orchestratorService.fetchAgentDump(args.memberIds);
    if (isScopesRpcErr(dump)) return { ok: false, error: dump.error.message };

    let responseText = "";
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId: AGENT_DESCRIPTION_GENERATOR_ID,
          surfaceKey: "orchestrator-generator",
          sourceFeature: "agent-generator",
          isEphemeral: true,
          autoClearConversation: true,
          config: { displayMode: "background", autoRun: true, allowChat: false },
          runtime: { variables: { [GENERATOR_INPUT_VAR]: dump.data } },
        }),
      ).unwrap();
      responseText = launch.responseText ?? "";
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Generation failed" };
    }

    const blocks = extractAgentBlocks(responseText);
    if (!blocks || !/<agent[\s>]/i.test(blocks)) {
      return { ok: false, error: "The description generator returned no agent blocks." };
    }
    return { ok: true, xml: blocks };
  };
}

/**
 * Re-generate the <available_agents> block from the given members and inject it
 * into the orchestrator's system prompt, then refresh Redux. Used by the builder's
 * "Sync prompt" action.
 */
export function syncOrchestratorPrompt(args: {
  orchestratorId: string;
  memberIds: string[];
}): AppThunk<Promise<{ ok: boolean; error?: string }>> {
  return async (dispatch) => {
    // Cheap pre-check BEFORE the slow LLM run: bail if this agent's prompt has no
    // <available_agents> section to fill (e.g. an arbitrary user-picked orchestrator).
    const marker = await orchestratorService.hasAvailableAgentsSection(args.orchestratorId);
    if (isScopesRpcErr(marker)) return { ok: false, error: marker.error.message };
    if (!marker.data) {
      return {
        ok: false,
        error: "This agent's prompt has no <available_agents> section to sync.",
      };
    }
    if (args.memberIds.length === 0) {
      return { ok: false, error: "Add members before syncing the prompt." };
    }

    const gen = await dispatch(runAgentDescriptionGenerator({ memberIds: args.memberIds }));
    if (!gen.ok || !gen.xml) return { ok: false, error: gen.error };

    const inj = await orchestratorService.injectAvailableAgents(args.orchestratorId, gen.xml);
    if (isScopesRpcErr(inj)) return { ok: false, error: inj.error.message };

    try {
      await dispatch(fetchFullAgent(args.orchestratorId)).unwrap();
    } catch {
      /* non-fatal — the write succeeded; Redux refresh is best-effort */
    }
    return { ok: true };
  };
}
