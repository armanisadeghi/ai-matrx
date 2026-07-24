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
import {
  orchestratorService,
  extractAgentBlocks,
  parseNamerOutput,
  isBlankIdentity,
} from "./orchestratorService";
import {
  AGENT_DESCRIPTION_GENERATOR_ID,
  AGENT_NAMER_ID,
  GENERATOR_INPUT_VAR,
  NAMER_INPUT_VAR,
} from "./constants";

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
 * Backfill member agents that are missing a name and/or description. Reads each
 * member's config, runs the Agent Namer headlessly on the ones with a blank name
 * OR description, and writes back ONLY the blank field(s) — an author's existing
 * name/description is never overwritten. Best-effort and never throws: a member
 * the caller can't edit (RLS) is skipped, and the returned `updated` count is how
 * many rows actually changed. Returns `ok:false` only on a hard read/generation
 * failure that a caller may want to surface.
 */
export function backfillMemberIdentities(args: {
  memberIds: string[];
}): AppThunk<Promise<{ ok: boolean; updated: number; error?: string }>> {
  return async (dispatch) => {
    if (args.memberIds.length === 0) return { ok: true, updated: 0 };

    const configs = await orchestratorService.fetchMemberConfigs(args.memberIds);
    if (isScopesRpcErr(configs)) {
      return { ok: false, updated: 0, error: configs.error.message };
    }

    // Only the members actually missing an identity field need generation.
    const needing = configs.data.filter(
      (m) => isBlankIdentity(m.name) || isBlankIdentity(m.description),
    );
    if (needing.length === 0) return { ok: true, updated: 0 };

    let responseText = "";
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId: AGENT_NAMER_ID,
          surfaceKey: "orchestrator-namer",
          sourceFeature: "agent-generator",
          isEphemeral: true,
          autoClearConversation: true,
          config: { displayMode: "background", autoRun: true, allowChat: false },
          runtime: {
            variables: { [NAMER_INPUT_VAR]: JSON.stringify(needing, null, 2) },
          },
        }),
      ).unwrap();
      responseText = launch.responseText ?? "";
    } catch (e) {
      return {
        ok: false,
        updated: 0,
        error: e instanceof Error ? e.message : "Naming failed",
      };
    }

    const named = parseNamerOutput(responseText);
    if (named.length === 0) {
      return {
        ok: false,
        updated: 0,
        error: "The namer returned no usable names.",
      };
    }
    const byId = new Map(named.map((n) => [n.id, n]));

    let updated = 0;
    for (const member of needing) {
      const gen = byId.get(member.id);
      if (!gen) continue;
      // Blank-only: fill a field only when the member's is blank AND the namer
      // produced a non-empty value for it. Never overwrite an author's value.
      const patch: { name?: string; description?: string } = {};
      if (isBlankIdentity(member.name) && gen.name) patch.name = gen.name;
      if (isBlankIdentity(member.description) && gen.description) {
        patch.description = gen.description;
      }
      if (patch.name === undefined && patch.description === undefined) continue;

      const res = await orchestratorService.updateAgentIdentity(member.id, patch);
      if (isScopesRpcErr(res)) {
        // A member the caller can't edit (shared/foreign-org) — skip it loudly,
        // don't fail the whole backfill.
        console.warn(
          `[agent-sets] could not backfill identity for member ${member.id}: ${res.error.message}`,
        );
        continue;
      }
      updated += 1;
      try {
        await dispatch(fetchFullAgent(member.id)).unwrap();
      } catch {
        /* non-fatal — the write succeeded; Redux refresh is best-effort */
      }
    }

    return { ok: true, updated };
  };
}

/**
 * Re-generate the <available_agents> block from the given members and inject it
 * into the orchestrator's system prompt, then refresh Redux. Used by the builder's
 * "Sync prompt" action. First backfills any member missing a name/description so
 * the generated listing (and the members themselves) carry real identities.
 */
export function syncOrchestratorPrompt(args: {
  orchestratorId: string;
  memberIds: string[];
}): AppThunk<Promise<{ ok: boolean; error?: string; membersUpdated?: number }>> {
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

    // Backfill member names/descriptions FIRST, so the orchestrator listing the
    // generator produces (and the member rows themselves) carry real identities.
    // Best-effort: a naming failure never blocks the orchestrator sync below.
    const backfill = await dispatch(
      backfillMemberIdentities({ memberIds: args.memberIds }),
    );
    const membersUpdated = backfill.ok ? backfill.updated : 0;
    if (!backfill.ok) {
      console.warn(
        `[agent-sets] member identity backfill did not complete: ${backfill.error}`,
      );
    }

    const gen = await dispatch(runAgentDescriptionGenerator({ memberIds: args.memberIds }));
    if (!gen.ok || !gen.xml) {
      return { ok: false, error: gen.error, membersUpdated };
    }

    const inj = await orchestratorService.injectAvailableAgents(args.orchestratorId, gen.xml);
    if (isScopesRpcErr(inj)) {
      return { ok: false, error: inj.error.message, membersUpdated };
    }

    try {
      await dispatch(fetchFullAgent(args.orchestratorId)).unwrap();
    } catch {
      /* non-fatal — the write succeeded; Redux refresh is best-effort */
    }
    return { ok: true, membersUpdated };
  };
}
