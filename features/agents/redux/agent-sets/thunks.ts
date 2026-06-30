// features/agents/agent-sets/redux/thunks.ts
//
// Thunks for Agent Sets. They write ONLY via `agentSetsService` (which itself
// goes through the canonical association chokepoint) and keep the `agentSets`
// read-model coherent. Member/config mutations apply optimistically and
// reconcile from the server on error.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { isScopesRpcErr } from "@/features/scopes/types";
import { agentSetsService } from "@/features/agents/agent-sets/service/agentSetsService";
import type { AgentSetConfig, AgentSetMember, AgentSetMemberMeta } from "@/features/agents/agent-sets/types";
import { agentSetsActions } from "./slice";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export interface SetWriteResult {
  ok: boolean;
  error?: string;
}

const listInFlight = { p: null as Promise<void> | null };

/** Load every set the user can see. Deduped; `status === "ready"` short-circuits. */
export function fetchAgentSets(opts?: { force?: boolean }): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const force = opts?.force ?? false;
    const status = getState().agentSets.listStatus;
    if (!force && status === "ready") return;
    if (!force && status === "loading" && listInFlight.p) return listInFlight.p;

    dispatch(agentSetsActions.listPending());
    const promise = (async () => {
      const res = await agentSetsService.list();
      if (isScopesRpcErr(res)) {
        dispatch(agentSetsActions.listRejected(res.error.message));
      } else {
        dispatch(agentSetsActions.listFulfilled(res.data));
      }
    })().finally(() => {
      listInFlight.p = null;
    });
    listInFlight.p = promise;
    return promise;
  };
}

/** Load one set's members + config. Skips when already ready unless `force`. */
export function loadAgentSet(
  orchestratorId: string,
  opts?: { force?: boolean },
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    if (!orchestratorId) return;
    const entry = getState().agentSets.byId[orchestratorId];
    if (!opts?.force && entry?.status === "ready") return;

    dispatch(agentSetsActions.detailPending(orchestratorId));
    const res = await agentSetsService.load(orchestratorId);
    if (isScopesRpcErr(res)) {
      dispatch(
        agentSetsActions.detailRejected({ orchestratorId, error: res.error.message }),
      );
    } else {
      dispatch(agentSetsActions.detailFulfilled(res.data));
    }
  };
}

/** Promote an agent to orchestrator / create its set (writes the marker self-edge). */
export function createAgentSet(args: {
  orchestratorId: string;
  label?: string;
  config?: AgentSetConfig;
}): AppThunk<Promise<SetWriteResult>> {
  return async (dispatch) => {
    const res = await agentSetsService.create(args.orchestratorId, {
      label: args.label,
      config: args.config,
    });
    if (isScopesRpcErr(res)) return { ok: false, error: res.error.message };
    // optimistic local config + accurate summary/detail from the server
    dispatch(
      agentSetsActions.configSet({
        orchestratorId: args.orchestratorId,
        config: args.config ?? {},
        label: args.label ?? null,
      }),
    );
    await Promise.all([
      dispatch(fetchAgentSets({ force: true })),
      dispatch(loadAgentSet(args.orchestratorId, { force: true })),
    ]);
    return { ok: true };
  };
}

/** Persist set-level config (accent / tagline / orchestrator position / label). */
export function saveSetConfig(args: {
  orchestratorId: string;
  config: AgentSetConfig;
  label?: string | null;
}): AppThunk<Promise<SetWriteResult>> {
  return async (dispatch) => {
    dispatch(
      agentSetsActions.configSet({
        orchestratorId: args.orchestratorId,
        config: args.config,
        label: args.label,
      }),
    );
    const res = await agentSetsService.saveConfig(args.orchestratorId, {
      config: args.config,
      label: args.label ?? undefined,
    });
    if (isScopesRpcErr(res)) {
      await dispatch(loadAgentSet(args.orchestratorId, { force: true }));
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  };
}

/** Add an agent into a set (optimistic; reconciles on error). */
export function addAgentToSet(args: {
  orchestratorId: string;
  agentId: string;
  meta?: AgentSetMemberMeta;
}): AppThunk<Promise<SetWriteResult>> {
  return async (dispatch, getState) => {
    const entry = getState().agentSets.byId[args.orchestratorId];
    if (entry?.members.some((m) => m.agentId === args.agentId)) {
      return { ok: true }; // already a member — idempotent
    }
    const position = entry?.members.length ?? 0;
    const member: AgentSetMember = {
      edgeId: `optimistic:${args.orchestratorId}:${args.agentId}`,
      agentId: args.agentId,
      position,
      roleTitle: args.meta?.roleTitle ?? null,
      gap: args.meta?.gap ?? null,
      pos: args.meta?.pos ?? null,
    };
    dispatch(agentSetsActions.memberAdded({ orchestratorId: args.orchestratorId, member }));

    const res = await agentSetsService.addMember(args.orchestratorId, args.agentId, {
      position,
      meta: args.meta,
    });
    if (isScopesRpcErr(res)) {
      dispatch(
        agentSetsActions.memberRemoved({
          orchestratorId: args.orchestratorId,
          agentId: args.agentId,
        }),
      );
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  };
}

/** Remove an agent from a set (optimistic; reconciles on error). */
export function removeAgentFromSet(args: {
  orchestratorId: string;
  agentId: string;
}): AppThunk<Promise<SetWriteResult>> {
  return async (dispatch) => {
    dispatch(agentSetsActions.memberRemoved(args));
    const res = await agentSetsService.removeMember(args.orchestratorId, args.agentId);
    if (isScopesRpcErr(res)) {
      await dispatch(loadAgentSet(args.orchestratorId, { force: true }));
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  };
}

/** Persist a new member order (optimistic; upserts each member's position). */
export function reorderSetMembers(args: {
  orchestratorId: string;
  orderedAgentIds: string[];
}): AppThunk<Promise<SetWriteResult>> {
  return async (dispatch, getState) => {
    dispatch(agentSetsActions.membersReordered(args));
    const members = getState().agentSets.byId[args.orchestratorId]?.members ?? [];
    const results = await Promise.all(
      members.map((m) =>
        agentSetsService.addMember(args.orchestratorId, m.agentId, {
          position: m.position,
          meta: {
            roleTitle: m.roleTitle ?? undefined,
            gap: m.gap ?? undefined,
            pos: m.pos ?? undefined,
          },
        }),
      ),
    );
    const bad = results.find((r) => isScopesRpcErr(r));
    if (bad && isScopesRpcErr(bad)) {
      await dispatch(loadAgentSet(args.orchestratorId, { force: true }));
      return { ok: false, error: bad.error.message };
    }
    return { ok: true };
  };
}

/** Persist a single member's authored role/gap/position metadata (optimistic). */
export function saveMemberMeta(args: {
  orchestratorId: string;
  agentId: string;
  meta: AgentSetMemberMeta;
}): AppThunk<Promise<SetWriteResult>> {
  return async (dispatch, getState) => {
    dispatch(agentSetsActions.memberMetaSet(args));
    const m = getState().agentSets.byId[args.orchestratorId]?.members.find(
      (x) => x.agentId === args.agentId,
    );
    const res = await agentSetsService.addMember(args.orchestratorId, args.agentId, {
      position: m?.position,
      meta: {
        roleTitle: m?.roleTitle ?? undefined,
        gap: m?.gap ?? undefined,
        pos: m?.pos ?? undefined,
      },
    });
    if (isScopesRpcErr(res)) {
      await dispatch(loadAgentSet(args.orchestratorId, { force: true }));
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  };
}

/** Delete a set (optimistic removal; restores list on error). */
export function deleteAgentSet(args: {
  orchestratorId: string;
}): AppThunk<Promise<SetWriteResult>> {
  return async (dispatch) => {
    dispatch(agentSetsActions.removeSummary(args.orchestratorId));
    const res = await agentSetsService.deleteSet(args.orchestratorId);
    if (isScopesRpcErr(res)) {
      await dispatch(fetchAgentSets({ force: true }));
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  };
}
