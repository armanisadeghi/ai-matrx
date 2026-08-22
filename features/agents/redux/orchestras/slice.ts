// features/agents/orchestras/redux/slice.ts
//
// Redux state for Orchestras (Conductors). Holds the enumerated set list and
// a per-set cache of ordered members + config. Membership/config truth lives in
// platform.associations; this slice is the read-model the builder renders and
// mutates optimistically (thunks reconcile on error). Mounted as `orchestras`.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  OrchestraConfig,
  OrchestraDetail,
  OrchestraMember,
  OrchestraMemberMeta,
  OrchestraSummary,
} from "@/features/agents/orchestras/types";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface OrchestraDetailEntry {
  members: OrchestraMember[];
  config: OrchestraConfig;
  label: string | null;
  /** Whether the `matrx_set` marker exists (false = "not an Orchestra yet"). */
  exists: boolean;
  status: LoadStatus;
  error: string | null;
}

export interface OrchestrasState {
  list: OrchestraSummary[];
  listStatus: LoadStatus;
  listError: string | null;
  byId: Record<string, OrchestraDetailEntry>;
}

const initialState: OrchestrasState = {
  list: [],
  listStatus: "idle",
  listError: null,
  byId: {},
};

function ensureEntry(state: OrchestrasState, orchId: string): OrchestraDetailEntry {
  let entry = state.byId[orchId];
  if (!entry) {
    entry = { members: [], config: {}, label: null, exists: false, status: "idle", error: null };
    state.byId[orchId] = entry;
  }
  return entry;
}

/** Keep a list summary's memberCount in sync with the live member array. */
function syncCount(state: OrchestrasState, orchId: string) {
  const entry = state.byId[orchId];
  const summary = state.list.find((s) => s.conductorId === orchId);
  if (entry && summary) summary.memberCount = entry.members.length;
}

const slice = createSlice({
  name: "orchestras",
  initialState,
  reducers: {
    // ─── list ──────────────────────────────────────────────────────────
    listPending(state) {
      state.listStatus = "loading";
      state.listError = null;
    },
    listFulfilled(state, action: PayloadAction<OrchestraSummary[]>) {
      state.list = action.payload;
      state.listStatus = "ready";
      state.listError = null;
    },
    listRejected(state, action: PayloadAction<string>) {
      state.listStatus = "error";
      state.listError = action.payload;
    },
    upsertSummary(state, action: PayloadAction<OrchestraSummary>) {
      const next = action.payload;
      const i = state.list.findIndex((s) => s.conductorId === next.conductorId);
      if (i === -1) state.list.unshift(next);
      else state.list[i] = next;
    },
    removeSummary(state, action: PayloadAction<string>) {
      state.list = state.list.filter((s) => s.conductorId !== action.payload);
      delete state.byId[action.payload];
    },

    // ─── per-set detail ────────────────────────────────────────────────
    detailPending(state, action: PayloadAction<string>) {
      const entry = ensureEntry(state, action.payload);
      entry.status = "loading";
      entry.error = null;
    },
    detailFulfilled(state, action: PayloadAction<OrchestraDetail>) {
      const { conductorId, members, config, label, exists } = action.payload;
      state.byId[conductorId] = {
        members,
        config,
        label,
        exists,
        status: "ready",
        error: null,
      };
      syncCount(state, conductorId);
    },
    detailRejected(state, action: PayloadAction<{ conductorId: string; error: string }>) {
      const entry = ensureEntry(state, action.payload.conductorId);
      entry.status = "error";
      entry.error = action.payload.error;
    },

    // ─── optimistic member ops ─────────────────────────────────────────
    memberAdded(state, action: PayloadAction<{ conductorId: string; member: OrchestraMember }>) {
      const entry = ensureEntry(state, action.payload.conductorId);
      if (entry.members.some((m) => m.agentId === action.payload.member.agentId)) return;
      entry.members.push(action.payload.member);
      entry.members.forEach((m, i) => (m.position = i));
      syncCount(state, action.payload.conductorId);
    },
    memberRemoved(state, action: PayloadAction<{ conductorId: string; agentId: string }>) {
      const entry = state.byId[action.payload.conductorId];
      if (!entry) return;
      entry.members = entry.members.filter((m) => m.agentId !== action.payload.agentId);
      entry.members.forEach((m, i) => (m.position = i));
      syncCount(state, action.payload.conductorId);
    },
    membersReordered(
      state,
      action: PayloadAction<{ conductorId: string; orderedAgentIds: string[] }>,
    ) {
      const entry = state.byId[action.payload.conductorId];
      if (!entry) return;
      const byAgent = new Map(entry.members.map((m) => [m.agentId, m]));
      const next = action.payload.orderedAgentIds
        .map((id) => byAgent.get(id))
        .filter((m): m is OrchestraMember => Boolean(m));
      next.forEach((m, i) => (m.position = i));
      entry.members = next;
    },
    memberMetaSet(
      state,
      action: PayloadAction<{ conductorId: string; agentId: string; meta: OrchestraMemberMeta }>,
    ) {
      const entry = state.byId[action.payload.conductorId];
      if (!entry) return;
      const m = entry.members.find((x) => x.agentId === action.payload.agentId);
      if (!m) return;
      const { roleTitle, gap, pos, required, resultMode } = action.payload.meta;
      if (roleTitle !== undefined) m.roleTitle = roleTitle || null;
      if (gap !== undefined) m.gap = gap || null;
      if (pos !== undefined) m.pos = pos;
      if (required !== undefined) m.required = required;
      if (resultMode !== undefined) m.resultMode = resultMode;
    },
    configSet(
      state,
      action: PayloadAction<{ conductorId: string; config: OrchestraConfig; label?: string | null }>,
    ) {
      const entry = ensureEntry(state, action.payload.conductorId);
      entry.config = action.payload.config;
      entry.exists = true; // writing the marker config implies the set exists
      if (action.payload.label !== undefined) entry.label = action.payload.label;
      // keep the list summary in sync if present
      const summary = state.list.find((s) => s.conductorId === action.payload.conductorId);
      if (summary) {
        summary.config = action.payload.config;
        if (action.payload.label !== undefined) summary.label = action.payload.label;
      }
    },
  },
});

export const orchestrasActions = slice.actions;
export default slice.reducer;
