// features/agents/agent-sets/orchestrator/thunks.ts
//
// The "Sync agent listings" flow. ONE click, ONE headless AI pass:
// `syncOrchestratorPrompt` runs the builtin Agent Set Role Describer over the
// WHOLE set — it reads each member's current config AND its current set role
// (Role title + gap), then returns a correct Role title + gap for EVERY member
// (filling blanks, fixing wrong ones, confirming good ones). Those are written to
// the member EDGES, and the orchestrator's <available_agents> block is then built
// deterministically from the corrected role/gap + each member's declared I/O.
//
// LIVE POSTURE (2026-08-11). The describe pass is the long part — one model call
// that reads EVERY member of the set — and it used to run headless behind the
// Sync button's spinner. It now runs `displayMode: "direct"` and streams into
// the floating `LiveRunWindow` (THE FLOATING LAW,
// features/window-panels/FEATURE.md). The window is floating, not inline: the
// builder canvas underneath must not shift while the user watches. The run's
// instance is deliberately KEPT after completion so the finished description
// stays readable in the window; the next sync releases it.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { openLiveRunWindowAction } from "@/features/overlays/openers/liveRunWindow";
import { selectRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
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

/**
 * The conversation whose instance the LAST sync deliberately kept alive so its
 * finished output stays readable in the floating window (THE FLOATING LAW: a
 * run that vanishes at the moment it completes is the same defect as a
 * spinner). Destroyed when the next sync starts, so at most ONE describer
 * instance is ever held.
 */
let lastLiveSyncConversationId: string | null = null;

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
 * One-click "make this orchestrator syncable": insert an empty
 * `<available_agents>` section into its system prompt when it lacks one, then
 * refresh Redux so the builder flips from the "Enable sync" (warning) action to
 * the normal "Sync agent listings" action. Idempotent at the service layer.
 */
export function enableOrchestratorSync(args: {
  orchestratorId: string;
}): AppThunk<Promise<{ ok: boolean; error?: string }>> {
  return async (dispatch) => {
    const res = await orchestratorService.ensureAvailableAgentsSection(
      args.orchestratorId,
    );
    if (isScopesRpcErr(res)) return { ok: false, error: res.error.message };
    try {
      await dispatch(fetchFullAgent(args.orchestratorId)).unwrap();
    } catch {
      /* non-fatal — the write succeeded; Redux refresh is best-effort */
    }
    return { ok: true };
  };
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

    // ── Describe: one headless pass over the whole set, with bounded retry ───
    // A headless agent run can transiently return nothing (cold start, a flaky
    // turn, a rate-limited provider). The describe is idempotent and cheap, so
    // retry a couple of times before giving up rather than silently doing the
    // wrong thing. `lastDetail` carries the most specific failure reason for the
    // final loud error.
    //
    // THE FLOATING LAW: this is a multi-minute AI pass over every member of the
    // set, and it used to run `displayMode: "background"` behind a spinner on
    // the Sync button. It now runs `direct` and streams into the canonical
    // floating `LiveRunWindow` — the user watches the describer work through
    // their agents instead of watching a spinner, and the builder underneath
    // never shifts. One window per set (`instanceId`), so a re-sync (and each
    // retry attempt) re-binds the SAME window instead of stacking a new one.
    const windowInstanceId = `agent-set-sync:${args.orchestratorId}`;
    const runLabel = "Reading your agents";
    dispatch(
      openLiveRunWindowAction({
        instanceId: windowInstanceId,
        label: runLabel,
        pending: true,
      }),
    );
    // The previous sync's instance was kept alive so its output stayed
    // readable; this run replaces it, so release it now.
    if (lastLiveSyncConversationId) {
      dispatch(destroyInstanceIfAllowed(lastLiveSyncConversationId));
      lastLiveSyncConversationId = null;
    }

    const DESCRIBE_ATTEMPTS = 3;
    let responseText = "";
    let lastDetail = "the AI run didn't execute";
    for (let attempt = 1; attempt <= DESCRIBE_ATTEMPTS; attempt++) {
      let requestId: string | undefined;
      try {
        const launch = await dispatch(
          launchAgentExecution({
            agentId: AGENT_SET_ROLE_DESCRIBER_ID,
            surfaceKey: "orchestrator-role-describer",
            sourceFeature: "agent-generator",
            isEphemeral: true,
            autoClearConversation: true,
            config: {
              displayMode: "direct",
              autoRun: true,
              allowChat: false,
              // The product is the roles, not the model's private reasoning.
              hideReasoning: true,
            },
            // Fires BEFORE the stream — this is what turns the window from
            // "pending" into live output within a second of the click.
            onConversationCreated: (conversationId) => {
              // A retry supersedes the previous attempt's instance.
              if (
                lastLiveSyncConversationId &&
                lastLiveSyncConversationId !== conversationId
              ) {
                dispatch(destroyInstanceIfAllowed(lastLiveSyncConversationId));
              }
              lastLiveSyncConversationId = conversationId;
              dispatch(
                openLiveRunWindowAction({
                  instanceId: windowInstanceId,
                  label:
                    attempt === 1
                      ? runLabel
                      : `${runLabel} (retry ${attempt} of ${DESCRIBE_ATTEMPTS})`,
                  conversationId,
                  pending: false,
                }),
              );
            },
            runtime: {
              variables: {
                [ROLE_DESCRIBER_INPUT_VAR]: JSON.stringify(dump, null, 2),
              },
            },
          }),
        ).unwrap();
        responseText = launch.responseText ?? "";
        requestId = launch.requestId;
      } catch (e) {
        lastDetail = e instanceof Error ? e.message : "the describe run threw";
      }

      if (responseText.trim().length > 0) break;

      const req = requestId ? selectRequest(requestId)(getState()) : null;
      lastDetail =
        req?.error?.user_message ||
        req?.error?.message ||
        (req?.status === "error" ? "the run ended in an error" : lastDetail);
      if (attempt < DESCRIBE_ATTEMPTS) {
        console.warn(
          `[agent-sets] role describer attempt ${attempt}/${DESCRIBE_ATTEMPTS} produced no output (${lastDetail}); retrying`,
        );
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }

    // LOUD failure, never a silent fallback: if the describer produced nothing
    // usable after retries, the AI run did not execute. We change NOTHING (no
    // member writes, no prompt injection) so the UI and the prompt can never
    // diverge — better a clear error the user can retry than a prompt quietly
    // filled with the wrong data.
    if (responseText.trim().length === 0) {
      return {
        ok: false,
        error: `The role describer produced no output — ${lastDetail}. Nothing was changed; check the AI runtime/endpoint and try Sync again.`,
      };
    }
    const described = parseRoleDescriberOutput(responseText);
    if (described.length === 0) {
      return {
        ok: false,
        error:
          "Couldn't read the role describer's output, so nothing was changed. Try Sync again.",
      };
    }
    const roleById = new Map(described.map((d) => [d.id, d]));

    // ── Write each member's corrected Role title + gap to its edge ──────────
    // Only write when the value actually changed (idempotent re-sync); skip a
    // member the caller can't edit — it just keeps its existing role/gap.
    let membersUpdated = 0;
    for (const m of members) {
      const d = roleById.get(m.agentId);
      if (!d || (!d.roleTitle && !d.gap)) continue;
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

    // ── Build <available_agents> from EXACTLY the persisted member edges ─────
    // Reload the set from the server first, then format ONLY the persisted role/
    // gap (never the agent's name/description). This makes the prompt identical
    // to what the member inspector shows by construction — the XML cannot carry
    // data the UI doesn't, and vice versa.
    await dispatch(loadAgentSet(args.orchestratorId, { force: true }));
    const savedMembers: AgentSetMember[] =
      getState().agentSets.byId[args.orchestratorId]?.members ?? members;
    const entries: AvailableAgentEntry[] = savedMembers
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((m) => {
        const c = configById.get(m.agentId);
        return {
          id: m.agentId,
          roleTitle: m.roleTitle ?? "",
          gap: m.gap ?? "",
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

    // Refresh the orchestrator's new prompt (the set was already reloaded above).
    try {
      await dispatch(fetchFullAgent(args.orchestratorId)).unwrap();
    } catch {
      /* non-fatal — the write succeeded; Redux refresh is best-effort */
    }

    return { ok: true, membersUpdated };
  };
}
