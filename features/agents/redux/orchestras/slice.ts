// features/agents/agent-sets/redux/slice.ts
//
// Redux state for Agent Sets (Orchestrators). Holds the enumerated set list and
// a per-set cache of ordered members + config. Membership/config truth lives in
// platform.associations; this slice is the read-model the builder renders and
// mutates optimistically (thunks reconcile on error). Mounted as `agentSets`.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  AgentSetConfig,
  AgentSetDetail,
  AgentSetMember,
  AgentSetMemberMeta,
  AgentSetSummary,
} from "@/features/agents/agent-sets/types";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface AgentSetDetailEntry {
  members: AgentSetMember[];
  config: AgentSetConfig;
  label: string | null;
  /** Whether the `matrx_set` marker exists (false = "not a set yet"). */
  exists: boolean;
  status: LoadStatus;
  error: string | null;
}

export interface AgentSetsState {
  list: AgentSetSummary[];
  listStatus: LoadStatus;
  listError: string | null;
  byId: Record<string, AgentSetDetailEntry>;
}

const initialState: AgentSetsState = {
  list: [],
  listStatus: "idle",
  listError: null,
  byId: {},
};

function ensureEntry(state: AgentSetsState, orchId: string): AgentSetDetailEntry {
  let entry = state.byId[orchId];
  if (!entry) {
    entry = { members: [], config: {}, label: null, exists: false, status: "idle", error: null };
    state.byId[orchId] = entry;
  }
  return entry;
}

/** Keep a list summary's memberCount in sync with the live member array. */
function syncCount(state: AgentSetsState, orchId: string) {
  const entry = state.byId[orchId];
  const summary = state.list.find((s) => s.orchestratorId === orchId);
  if (entry && summary) summary.memberCount = entry.members.length;
}

const slice = createSlice({
  name: "agentSets",
  initialState,
  reducers: {
    // ─── list ──────────────────────────────────────────────────────────
    listPending(state) {
      state.listStatus = "loading";
      state.listError = null;
    },
    listFulfilled(state, action: PayloadAction<AgentSetSummary[]>) {
      state.list = action.payload;
      state.listStatus = "ready";
      state.listError = null;
    },
    listRejected(state, action: PayloadAction<string>) {
      state.listStatus = "error";
      state.listError = action.payload;
    },
    upsertSummary(state, action: PayloadAction<AgentSetSummary>) {
      const next = action.payload;
      const i = state.list.findIndex((s) => s.orchestratorId === next.orchestratorId);
      if (i === -1) state.list.unshift(next);
      else state.list[i] = next;
    },
    removeSummary(state, action: PayloadAction<string>) {
      state.list = state.list.filter((s) => s.orchestratorId !== action.payload);
      delete state.byId[action.payload];
    },

    // ─── per-set detail ────────────────────────────────────────────────
    detailPending(state, action: PayloadAction<string>) {
      const entry = ensureEntry(state, action.payload);
      entry.status = "loading";
      entry.error = null;
    },
    detailFulfilled(state, action: PayloadAction<AgentSetDetail>) {
      const { orchestratorId, members, config, label, exists } = action.payload;
      state.byId[orchestratorId] = {
        members,
        config,
        label,
        exists,
        status: "ready",
        error: null,
      };
      syncCount(state, orchestratorId);
    },
    detailRejected(state, action: PayloadAction<{ orchestratorId: string; error: string }>) {
      const entry = ensureEntry(state, action.payload.orchestratorId);
      entry.status = "error";
      entry.error = action.payload.error;
    },

    // ─── optimistic member ops ─────────────────────────────────────────
    memberAdded(state, action: PayloadAction<{ orchestratorId: string; member: AgentSetMember }>) {
      const entry = ensureEntry(state, action.payload.orchestratorId);
      if (entry.members.some((m) => m.agentId === action.payload.member.agentId)) return;
      entry.members.push(action.payload.member);
      entry.members.forEach((m, i) => (m.position = i));
      syncCount(state, action.payload.orchestratorId);
    },
    memberRemoved(state, action: PayloadAction<{ orchestratorId: string; agentId: string }>) {
      const entry = state.byId[action.payload.orchestratorId];
      if (!entry) return;
      entry.members = entry.members.filter((m) => m.agentId !== action.payload.agentId);
      entry.members.forEach((m, i) => (m.position = i));
      syncCount(state, action.payload.orchestratorId);
    },
    membersReordered(
      state,
      action: PayloadAction<{ orchestratorId: string; orderedAgentIds: string[] }>,
    ) {
      const entry = state.byId[action.payload.orchestratorId];
      if (!entry) return;
      const byAgent = new Map(entry.members.map((m) => [m.agentId, m]));
      const next = action.payload.orderedAgentIds
        .map((id) => byAgent.get(id))
        .filter((m): m is AgentSetMember => Boolean(m));
      next.forEach((m, i) => (m.position = i));
      entry.members = next;
    },
    memberMetaSet(
      state,
      action: PayloadAction<{ orchestratorId: string; agentId: string; meta: AgentSetMemberMeta }>,
    ) {
      const entry = state.byId[action.payload.orchestratorId];
      if (!entry) return;
      const m = entry.members.find((x) => x.agentId === action.payload.agentId);
      if (!m) return;
      const { roleTitle, gap, pos } = action.payload.meta;
      if (roleTitle !== undefined) m.roleTitle = roleTitle || null;
      if (gap !== undefined) m.gap = gap || null;
      if (pos !== undefined) m.pos = pos;
    },
    configSet(
      state,
      action: PayloadAction<{ orchestratorId: string; config: AgentSetConfig; label?: string | null }>,
    ) {
      const entry = ensureEntry(state, action.payload.orchestratorId);
      entry.config = action.payload.config;
      entry.exists = true; // writing the marker config implies the set exists
      if (action.payload.label !== undefined) entry.label = action.payload.label;
      // keep the list summary in sync if present
      const summary = state.list.find((s) => s.orchestratorId === action.payload.orchestratorId);
      if (summary) {
        summary.config = action.payload.config;
        if (action.payload.label !== undefined) summary.label = action.payload.label;
      }
    },
  },
});

export const agentSetsActions = slice.actions;
export default slice.reducer;
