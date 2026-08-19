// features/agents/orchestras/redux/thunks.ts
//
// Thunks for Orchestras. They write ONLY via `orchestrasService` (which itself
// goes through the canonical association chokepoint) and keep the `orchestras`
// read-model coherent. Member/config mutations apply optimistically and
// reconcile from the server on error.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { isScopesRpcErr } from "@/features/scopes/types";
import { orchestrasService } from "@/features/agents/orchestras/service/orchestrasService";
import type {
  OrchestraConfig,
  OrchestraMember,
  OrchestraMemberMeta,
} from "@/features/agents/orchestras/types";
import { DEFAULT_ORCHESTRA_RESULT_MODE } from "@/features/agents/orchestras/constants";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { purposeService, type GroundingTag } from "@/features/purpose/service";
import { orchestrasActions } from "./slice";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export interface OrchestraWriteResult {
  ok: boolean;
  error?: string;
}

const listInFlight = { p: null as Promise<void> | null };

// Member-agent hydration in flight (module-level: `setAgentLoading` is a no-op
// for ids that don't exist in the agentDefinition slice yet, so the slice can't
// dedupe these fetches itself).
const memberHydrationInFlight = new Set<string>();

/**
 * Batch-hydrate member agents that aren't in the agentDefinition slice.
 *
 * `initializeChatAgents` only loads the user's own gallery (`agx_get_list`), so
 * a member agent shared-with-you via the set renders the "Agent" fallback name
 * in AgentRoleCard until its definition is fetched. Orchestras are small, so parallel
 * `fetchFullAgent` calls (the canonical single-agent fetch) are fine. Guarded
 * against refetch loops: only ids absent from state and not already in flight
 * are fetched; failures (e.g. access revoked) reject their thunk action and are
 * not retried here.
 */
function hydrateMissingMemberAgents(
  members: OrchestraMember[],
): AppThunk<void> {
  return (dispatch, getState) => {
    const loaded = getState().agentDefinition.agents;
    const missing = members
      .map((m) => m.agentId)
      .filter((id) => id && !loaded[id] && !memberHydrationInFlight.has(id));
    if (missing.length === 0) return;

    for (const id of missing) {
      memberHydrationInFlight.add(id);
      // createAsyncThunk promises never throw un-unwrapped; fire-and-forget so
      // set loading is never blocked on member hydration.
      void dispatch(fetchFullAgent(id)).finally(() => {
        memberHydrationInFlight.delete(id);
      });
    }
  };
}

/** Load every Orchestra the user can see. Deduped; `status === "ready"` short-circuits. */
export function fetchOrchestras(opts?: {
  force?: boolean;
}): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const force = opts?.force ?? false;
    const status = getState().orchestras.listStatus;
    if (!force && status === "ready") return;
    if (!force && status === "loading" && listInFlight.p) return listInFlight.p;

    dispatch(orchestrasActions.listPending());
    const promise = (async () => {
      const res = await orchestrasService.list();
      if (isScopesRpcErr(res)) {
        dispatch(orchestrasActions.listRejected(res.error.message));
      } else {
        dispatch(orchestrasActions.listFulfilled(res.data));
      }
    })().finally(() => {
      listInFlight.p = null;
    });
    listInFlight.p = promise;
    return promise;
  };
}

/** Load one Orchestra's members + config. Skips when already ready unless `force`. */
export function loadOrchestra(
  orchestratorId: string,
  opts?: { force?: boolean },
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    if (!orchestratorId) return;
    const entry = getState().orchestras.byId[orchestratorId];
    if (!opts?.force && entry?.status === "ready") return;

    dispatch(orchestrasActions.detailPending(orchestratorId));
    const res = await orchestrasService.load(orchestratorId);
    if (isScopesRpcErr(res)) {
      dispatch(
        orchestrasActions.detailRejected({
          orchestratorId,
          error: res.error.message,
        }),
      );
    } else {
      dispatch(orchestrasActions.detailFulfilled(res.data));
      // Shared-member hydration: members outside the user's own agents slice
      // (shared-with-you) need their definitions fetched or they render "Agent".
      dispatch(hydrateMissingMemberAgents(res.data.members));
    }
  };
}

/** Promote an agent to orchestrator / create its set (writes the marker self-edge). */
export function createOrchestra(args: {
  orchestratorId: string;
  label?: string;
  config?: OrchestraConfig;
}): AppThunk<Promise<OrchestraWriteResult>> {
  return async (dispatch) => {
    const res = await orchestrasService.create(args.orchestratorId, {
      label: args.label,
      config: args.config,
    });
    if (isScopesRpcErr(res)) return { ok: false, error: res.error.message };
    // optimistic local config + accurate summary/detail from the server
    dispatch(
      orchestrasActions.configSet({
        orchestratorId: args.orchestratorId,
        config: args.config ?? {},
        label: args.label ?? null,
      }),
    );
    await Promise.all([
      dispatch(fetchOrchestras({ force: true })),
      dispatch(loadOrchestra(args.orchestratorId, { force: true })),
    ]);
    return { ok: true };
  };
}

/** Persist Orchestra-level config (accent / tagline / orchestrator position / label). */
export function saveOrchestraConfig(args: {
  orchestratorId: string;
  config: OrchestraConfig;
  label?: string | null;
}): AppThunk<Promise<OrchestraWriteResult>> {
  return async (dispatch) => {
    dispatch(
      orchestrasActions.configSet({
        orchestratorId: args.orchestratorId,
        config: args.config,
        label: args.label,
      }),
    );
    const res = await orchestrasService.saveConfig(args.orchestratorId, {
      config: args.config,
      label: args.label ?? undefined,
    });
    if (isScopesRpcErr(res)) {
      await dispatch(loadOrchestra(args.orchestratorId, { force: true }));
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  };
}

/** Add an agent into a set (optimistic; reconciles on error). */
export function addAgentToOrchestra(args: {
  orchestratorId: string;
  agentId: string;
  meta?: OrchestraMemberMeta;
}): AppThunk<Promise<OrchestraWriteResult>> {
  return async (dispatch, getState) => {
    const entry = getState().orchestras.byId[args.orchestratorId];
    if (entry?.members.some((m) => m.agentId === args.agentId)) {
      return { ok: true }; // already a member — idempotent
    }
    const position = entry?.members.length ?? 0;
    const member: OrchestraMember = {
      edgeId: `optimistic:${args.orchestratorId}:${args.agentId}`,
      agentId: args.agentId,
      position,
      roleTitle: args.meta?.roleTitle ?? null,
      gap: args.meta?.gap ?? null,
      pos: args.meta?.pos ?? null,
      required: args.meta?.required === true,
      resultMode: args.meta?.resultMode ?? DEFAULT_ORCHESTRA_RESULT_MODE,
    };
    dispatch(
      orchestrasActions.memberAdded({
        orchestratorId: args.orchestratorId,
        member,
      }),
    );

    const res = await orchestrasService.addMember(
      args.orchestratorId,
      args.agentId,
      {
        position,
        meta: args.meta,
      },
    );
    if (isScopesRpcErr(res)) {
      dispatch(
        orchestrasActions.memberRemoved({
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
export function removeAgentFromOrchestra(args: {
  orchestratorId: string;
  agentId: string;
}): AppThunk<Promise<OrchestraWriteResult>> {
  return async (dispatch) => {
    dispatch(orchestrasActions.memberRemoved(args));
    const res = await orchestrasService.removeMember(
      args.orchestratorId,
      args.agentId,
    );
    if (isScopesRpcErr(res)) {
      await dispatch(loadOrchestra(args.orchestratorId, { force: true }));
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  };
}

/** Persist a new member order (optimistic; upserts each member's position). */
export function reorderOrchestraMembers(args: {
  orchestratorId: string;
  orderedAgentIds: string[];
}): AppThunk<Promise<OrchestraWriteResult>> {
  return async (dispatch, getState) => {
    dispatch(orchestrasActions.membersReordered(args));
    const members =
      getState().orchestras.byId[args.orchestratorId]?.members ?? [];
    const results = await Promise.all(
      members.map((m) =>
        orchestrasService.addMember(args.orchestratorId, m.agentId, {
          position: m.position,
          meta: {
            roleTitle: m.roleTitle ?? undefined,
            gap: m.gap ?? undefined,
            pos: m.pos ?? undefined,
            // Reorder is a full-metadata upsert — carrying these through is
            // what keeps a reorder from silently un-designating a member or
            // resetting how its result comes back.
            required: m.required === true,
            resultMode: m.resultMode ?? DEFAULT_ORCHESTRA_RESULT_MODE,
          },
        }),
      ),
    );
    const bad = results.find((r) => isScopesRpcErr(r));
    if (bad && isScopesRpcErr(bad)) {
      await dispatch(loadOrchestra(args.orchestratorId, { force: true }));
      return { ok: false, error: bad.error.message };
    }
    return { ok: true };
  };
}

/**
 * Persist a single member's authored role/gap/position metadata (optimistic).
 *
 * 🚨 THIS IS THE ONE WRITER OF A MEMBER'S CHARACTERIZATION, and since C-20 that
 * means it writes it in BOTH places: the member edge (`label` = role title,
 * `metadata.gap` — the prompt-injection pipeline in
 * `orchestras/orchestrator/thunks.ts` reads exactly these to build
 * `<available_agents>`) AND a `platform.purpose` row linked to the member agent.
 *
 * Do NOT "migrate" the gap off the edge, and do NOT add a second call site that
 * writes one without the other — the roster gap and the purpose registry are two
 * views of the same authored fact, and the moment two writers own them they
 * drift. Purpose TEXT still never touches edge metadata: the edge keeps the gap
 * it always kept for the prompt, and the registry keeps the versioned,
 * grounded, measurable copy (D-2 / 01-data-model §2).
 *
 * `groundingTag` says who authored this call — `"V"` when a human edited it in
 * the member inspector (AI-drafted, human-verified), `"A"` when the Role
 * Describer wrote it. The DB refuses an `A` write over an existing `H`/`V`
 * purpose (Engram §4.5 anti-stacking), so a re-sync can never un-ground a
 * statement a person corrected.
 *
 * A purpose failure is NON-FATAL and LOUD: the Orchestra edge is what the
 * product runs on, and losing a role/gap save because the registry hiccuped
 * would be a worse outcome than a missing purpose row (which the sweep and the
 * coverage count both catch).
 */
export function saveMemberMeta(args: {
  orchestratorId: string;
  agentId: string;
  meta: OrchestraMemberMeta;
  groundingTag?: GroundingTag;
}): AppThunk<Promise<OrchestraWriteResult>> {
  return async (dispatch, getState) => {
    dispatch(orchestrasActions.memberMetaSet(args));
    const m = getState().orchestras.byId[args.orchestratorId]?.members.find(
      (x) => x.agentId === args.agentId,
    );
    const res = await orchestrasService.addMember(
      args.orchestratorId,
      args.agentId,
      {
        position: m?.position,
        meta: {
          roleTitle: m?.roleTitle ?? undefined,
          gap: m?.gap ?? undefined,
          pos: m?.pos ?? undefined,
          required: m?.required === true,
          resultMode: m?.resultMode ?? DEFAULT_ORCHESTRA_RESULT_MODE,
        },
      },
    );
    if (isScopesRpcErr(res)) {
      await dispatch(loadOrchestra(args.orchestratorId, { force: true }));
      return { ok: false, error: res.error.message };
    }

    // The same authored fact, into the registry. Only when there is something
    // to say — a pure drag (position-only save) characterizes nothing.
    const title = (m?.roleTitle ?? "").trim();
    const statement = (m?.gap ?? "").trim();
    if (title && statement) {
      const purposeRes = await purposeService.upsertForUnit({
        unitType: "agent",
        unitId: args.agentId,
        title,
        statement,
        groundingTag: args.groundingTag ?? "V",
      });
      if (isScopesRpcErr(purposeRes)) {
        console.warn(
          `[orchestras] member ${args.agentId} role/gap saved, but its purpose row did not: ` +
            `${purposeRes.error.message}. The unit will show as purposeless on the ` +
            `grounding surface until the next save or purpose sweep.`,
        );
      }
    }
    return { ok: true };
  };
}

/** Delete a set (optimistic removal; restores list on error). */
export function deleteOrchestra(args: {
  orchestratorId: string;
}): AppThunk<Promise<OrchestraWriteResult>> {
  return async (dispatch) => {
    dispatch(orchestrasActions.removeSummary(args.orchestratorId));
    const res = await orchestrasService.deleteOrchestra(args.orchestratorId);
    if (isScopesRpcErr(res)) {
      await dispatch(fetchOrchestras({ force: true }));
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  };
}
