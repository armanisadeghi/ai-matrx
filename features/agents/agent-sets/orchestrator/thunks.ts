// features/agents/agent-sets/orchestrator/thunks.ts
//
// The "Sync agent listings" flow. ONE click, ONE headless AI pass:
// `syncOrchestratorPrompt` runs the builtin Agent Set Role Describer over the
// WHOLE set — it reads each member's current config AND its current set role
// (Role title + gap), then returns a correct Role title + gap for EVERY member
// (filling blanks, fixing wrong ones, confirming good ones). Those are written to
// the member EDGES, and the orchestrator's <available_agents> block is then built
// deterministically from the corrected role/gap + each member's declared I/O.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { saveMemberMeta, loadAgentSet } from "@/features/agents/redux/agent-sets/thunks";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { AgentSetMember } from "../types";
import {
  orchestratorService,
  parseRoleDescriberOutput,
  systemPromptOf,
  inputNamesOf,
  outputLabelOf,
  buildAvailableAgentsBlock,
  type MemberConfigRow,
  type AvailableAgentEntry,
} from "./orchestratorService";
import {
  AGENT_SET_ROLE_DESCRIBER_ID,
  ROLE_DESCRIBER_INPUT_VAR,
} from "./constants";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

/** One member's config + its current set role, fed to the describer. */
interface MemberDumpEntry {
  id: string;
  agent_name: string | null;
  agent_description: string | null;
  system_prompt: string;
  inputs: string[];
  output: string;
  current_role_title: string | null;
  current_gap: string | null;
}

/**
 * Re-describe every member and re-sync the orchestrator's <available_agents>.
 * The builder's "Sync agent listings" action.
 *
 * 1. Read the current members (with their authored Role title/gap) + each member
 *    agent's config.
 * 2. Run the Agent Set Role Describer ONCE over all of them — it returns a correct
 *    {id, role_title, gap} for every member (fills blanks, fixes wrong ones,
 *    confirms good ones).
 * 3. Write each member's Role title + gap back to its edge (only when changed).
 * 4. Build <available_agents> from the corrected role/gap + declared inputs/outputs
 *    and inject it. Never throws; a member the caller can't edit is skipped.
 */
export function syncOrchestratorPrompt(args: {
  orchestratorId: string;
  memberIds: string[];
}): AppThunk<Promise<{ ok: boolean; error?: string; membersUpdated?: number }>> {
  return async (dispatch, getState) => {
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

    // The members with their CURRENT authored role/gap + position (Redux is the
    // source of truth the inspector/canvas also read).
    const members: AgentSetMember[] =
      getState().agentSets.byId[args.orchestratorId]?.members ?? [];
    if (members.length === 0) {
      return { ok: false, error: "Add members before syncing the prompt." };
    }
    const memberIds = members.map((m) => m.agentId);

    // Each member agent's config (system prompt, inputs, output shape).
    const configsRes = await orchestratorService.fetchMemberConfigs(memberIds);
    if (isScopesRpcErr(configsRes)) {
      return { ok: false, error: configsRes.error.message };
    }
    const configById = new Map<string, MemberConfigRow>(
      configsRes.data.map((c) => [c.id, c]),
    );

    // Build the describer dump — config + the member's CURRENT role/gap, so the
    // model can confirm what's already accurate and only rewrite what isn't.
    const dump: MemberDumpEntry[] = members.map((m) => {
      const c = configById.get(m.agentId);
      return {
        id: m.agentId,
        agent_name: c?.name ?? null,
        agent_description: c?.description ?? null,
        system_prompt: systemPromptOf(c?.messages),
        inputs: inputNamesOf(c?.variable_definitions),
        output: outputLabelOf(c?.output_schema),
        current_role_title: m.roleTitle,
        current_gap: m.gap,
      };
    });

    // ── Describe: one headless pass over the whole set ──────────────────────
    let responseText = "";
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId: AGENT_SET_ROLE_DESCRIBER_ID,
          surfaceKey: "orchestrator-role-describer",
          sourceFeature: "agent-generator",
          isEphemeral: true,
          autoClearConversation: true,
          config: { displayMode: "background", autoRun: true, allowChat: false },
          runtime: {
            variables: {
              [ROLE_DESCRIBER_INPUT_VAR]: JSON.stringify(dump, null, 2),
            },
          },
        }),
      ).unwrap();
      responseText = launch.responseText ?? "";
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Describing members failed",
      };
    }

    const described = parseRoleDescriberOutput(responseText);
    const roleById = new Map(described.map((d) => [d.id, d]));

    // ── Write each member's corrected Role title + gap to its edge ──────────
    // Only write when the value actually changed (idempotent re-sync); skip a
    // member the caller can't edit — it just keeps its existing role/gap.
    let membersUpdated = 0;
    for (const m of members) {
      const d = roleById.get(m.agentId);
      if (!d) continue;
      const nextRole = d.roleTitle || m.roleTitle || "";
      const nextGap = d.gap || m.gap || "";
      if (nextRole === (m.roleTitle ?? "") && nextGap === (m.gap ?? "")) continue;

      const res = await dispatch(
        saveMemberMeta({
          orchestratorId: args.orchestratorId,
          agentId: m.agentId,
          meta: { roleTitle: nextRole, gap: nextGap, pos: m.pos ?? undefined },
        }),
      );
      if (res.ok) membersUpdated += 1;
      else {
        console.warn(
          `[agent-sets] could not save role/gap for member ${m.agentId}: ${res.error}`,
        );
      }
    }

    // ── Build <available_agents> from the corrected role/gap + declared I/O ──
    // Read the members back from Redux so we format exactly what was persisted
    // (saveMemberMeta updated the store), falling back to the describer output.
    const savedMembers: AgentSetMember[] =
      getState().agentSets.byId[args.orchestratorId]?.members ?? members;
    const entries: AvailableAgentEntry[] = savedMembers
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((m) => {
        const c = configById.get(m.agentId);
        const d = roleById.get(m.agentId);
        return {
          id: m.agentId,
          roleTitle: m.roleTitle || d?.roleTitle || c?.name || "",
          gap: m.gap || d?.gap || c?.description || "",
          inputs: inputNamesOf(c?.variable_definitions),
          output: outputLabelOf(c?.output_schema),
        };
      });

    const block = buildAvailableAgentsBlock(entries);
    const inj = await orchestratorService.injectAvailableAgents(
      args.orchestratorId,
      block,
    );
    if (isScopesRpcErr(inj)) {
      return { ok: false, error: inj.error.message, membersUpdated };
    }

    // Refresh: the orchestrator's new prompt + the set's members (role/gap).
    try {
      await dispatch(fetchFullAgent(args.orchestratorId)).unwrap();
    } catch {
      /* non-fatal — the write succeeded; Redux refresh is best-effort */
    }
    await dispatch(loadAgentSet(args.orchestratorId, { force: true }));

    return { ok: true, membersUpdated };
  };
}
