// lib/redux/slices/agentCacheSlice.ts
//
// Unified Redux cache for all agent data (user prompts + builtins + shared).
//
// Data Depth Layers:
//   slim        — id + name only. Used for sidebar and picker initial render.
//   core        — adds display/filter fields (description, tags, category, etc.)
//                 Used when the agent picker is open or user is browsing.
//   operational — full agent config: variable_defaults, dynamic_model, settings (model_id,
//                 temperature, tools, etc.). Fetched when a user selects an agent to chat with.
//
// Fields NEVER stored here: messages
//
// Sources:
//   prompts  — the current user's own prompts
//   builtins — system-provided agents (migrated from prompt_builtins → agent.definition, same UUIDs)
//   shared   — prompts explicitly shared with the current user (not "secret sauce" share)

import { createSlice, createSelector, PayloadAction } from "@reduxjs/toolkit";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentDepth = "slim" | "core" | "operational";
export type AgentSource = "prompts" | "builtins" | "shared";
export type AgentFetchStatus = "idle" | "loading" | "success" | "error";

export interface AgentRecord {
  id: string;
  source: AgentSource;
  depth: AgentDepth;

  // slim fields — always present
  name: string;

  // core fields — present when depth >= 'core'
  description?: string;
  tags?: string[];
  category?: string;
  isArchived?: boolean;
  isFavorite?: boolean;
  isActive?: boolean; // builtins only
  outputFormat?: string;
  createdAt?: string; // ISO timestamp string
  updatedAt?: string; // ISO timestamp string
  version?: number;

  // shared-only metadata — present when source === 'shared'
  permissionLevel?: "viewer" | "editor" | "admin";
  ownerEmail?: string;

  // operational fields — present only when depth === 'operational'
  variableDefaults?: unknown[];
  dynamicModel?: boolean;
  /**
   * Full settings jsonb from the DB.
   * Contains model_id, temperature, tools, thinking_budget, include_thoughts, etc.
   * Use the per-field selectors (selectAgentModelId, selectAgentTools,
   * selectAgentRuntimeSettings) rather than reading this directly.
   */
  settings?: Record<string, unknown>;

  // NEVER stored: messages
}

interface PerSourceStatus {
  owned: AgentFetchStatus;
  builtins: AgentFetchStatus;
  shared: AgentFetchStatus;
}

interface PerSourceTimestamp {
  owned: number | null;
  builtins: number | null;
  shared: number | null;
}

export interface AgentCacheState {
  // Primary record store — keyed by agent id
  byId: Record<string, AgentRecord>;

  // ID lists per source for ordered iteration
  ownedIds: string[];
  builtinIds: string[];
  sharedIds: string[];

  // Cursor-based pagination state (builtins always fetched whole)
  ownedCursor: string | null;
  sharedCursor: string | null;
  ownedHasMore: boolean;
  sharedHasMore: boolean;

  // Per-source fetch tracking
  fetchStatus: PerSourceStatus;
  lastFetchedAt: PerSourceTimestamp;

  error: string | null;
}

const initialState: AgentCacheState = {
  byId: {},
  ownedIds: [],
  builtinIds: [],
  sharedIds: [],
  ownedCursor: null,
  sharedCursor: null,
  ownedHasMore: false,
  sharedHasMore: false,
  fetchStatus: {
    owned: "idle",
    builtins: "idle",
    shared: "idle",
  },
  lastFetchedAt: {
    owned: null,
    builtins: null,
    shared: null,
  },
  error: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the depth rank for comparison. Higher = more data. */
function depthRank(d: AgentDepth): number {
  return d === "slim" ? 0 : d === "core" ? 1 : 2;
}

/** Merges an incoming slim record without downgrading existing depth. */
function mergeSlim(
  existing: AgentRecord | undefined,
  incoming: AgentRecord,
): AgentRecord {
  if (!existing) return incoming;
  if (depthRank(existing.depth) >= depthRank(incoming.depth)) {
    // Keep the richer existing record; only refresh the name in case it changed
    return { ...existing, name: incoming.name };
  }
  return incoming;
}

// ── Slice ─────────────────────────────────────────────────────────────────────

const agentCacheSlice = createSlice({
  name: "agentCache",
  initialState,
  reducers: {
    /**
     * Merge slim agent records into the cache.
     * Never downgrades the depth of an existing record.
     * Appends new IDs to the appropriate source list; skips duplicates.
     */
    upsertAgentsSlim: (state, action: PayloadAction<AgentRecord[]>) => {
      for (const agent of action.payload) {
        state.byId[agent.id] = mergeSlim(state.byId[agent.id], agent);

        // Add to the appropriate id list if not already present
        if (agent.source === "prompts" && !state.ownedIds.includes(agent.id)) {
          state.ownedIds.push(agent.id);
        } else if (
          agent.source === "builtins" &&
          !state.builtinIds.includes(agent.id)
        ) {
          state.builtinIds.push(agent.id);
        } else if (
          agent.source === "shared" &&
          !state.sharedIds.includes(agent.id)
        ) {
          state.sharedIds.push(agent.id);
        }
      }
    },

    /**
     * Upgrade agent records to core depth.
     * Merges all core fields; never downgrades to slim.
     */
    upsertAgentsCore: (state, action: PayloadAction<AgentRecord[]>) => {
      for (const agent of action.payload) {
        const existing = state.byId[agent.id];
        if (existing && depthRank(existing.depth) > depthRank("core")) {
          // Already at operational — patch core fields but keep depth
          state.byId[agent.id] = {
            ...existing,
            ...agent,
            depth: existing.depth,
            variableDefaults: existing.variableDefaults,
            dynamicModel: existing.dynamicModel,
          };
        } else {
          state.byId[agent.id] = { ...existing, ...agent, depth: "core" };
        }

        // Ensure the id is tracked in the appropriate list
        if (agent.source === "prompts" && !state.ownedIds.includes(agent.id)) {
          state.ownedIds.push(agent.id);
        } else if (
          agent.source === "builtins" &&
          !state.builtinIds.includes(agent.id)
        ) {
          state.builtinIds.push(agent.id);
        } else if (
          agent.source === "shared" &&
          !state.sharedIds.includes(agent.id)
        ) {
          state.sharedIds.push(agent.id);
        }
      }
    },

    /**
     * Upgrade a single agent record to operational depth.
     * Merges variableDefaults + dynamicModel onto the existing record.
     */
    upsertAgentOperational: (state, action: PayloadAction<AgentRecord>) => {
      const agent = action.payload;
      const existing = state.byId[agent.id];
      state.byId[agent.id] = {
        ...(existing ?? agent),
        variableDefaults: agent.variableDefaults,
        dynamicModel: agent.dynamicModel,
        settings: agent.settings,
        depth: "operational",
      };
    },

    /** Update fetch status for a specific source. */
    setAgentFetchStatus: (
      state,
      action: PayloadAction<{
        source: keyof PerSourceStatus;
        status: AgentFetchStatus;
      }>,
    ) => {
      const { source, status } = action.payload;
      state.fetchStatus[source] = status;
    },

    /** Record the timestamp of a successful fetch for a source. */
    setAgentLastFetchedAt: (
      state,
      action: PayloadAction<{
        source: keyof PerSourceTimestamp;
        timestamp: number;
      }>,
    ) => {
      const { source, timestamp } = action.payload;
      state.lastFetchedAt[source] = timestamp;
    },

    /** Update cursor and hasMore after a paginated fetch. */
    setAgentCursors: (
      state,
      action: PayloadAction<{ owned?: string | null; shared?: string | null }>,
    ) => {
      const { owned, shared } = action.payload;
      if (owned !== undefined) state.ownedCursor = owned;
      if (shared !== undefined) state.sharedCursor = shared;
    },

    /** Update hasMore flags after a paginated fetch. */
    setAgentHasMore: (
      state,
      action: PayloadAction<{ owned?: boolean; shared?: boolean }>,
    ) => {
      const { owned, shared } = action.payload;
      if (owned !== undefined) state.ownedHasMore = owned;
      if (shared !== undefined) state.sharedHasMore = shared;
    },

    /** Record a global error message. */
    setAgentError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },

    /**
     * Remove a single agent from the cache by id.
     * Also removes it from the appropriate id list.
     */
    removeAgent: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      const agent = state.byId[id];
      if (agent) {
        if (agent.source === "prompts")
          state.ownedIds = state.ownedIds.filter((i) => i !== id);
        if (agent.source === "builtins")
          state.builtinIds = state.builtinIds.filter((i) => i !== id);
        if (agent.source === "shared")
          state.sharedIds = state.sharedIds.filter((i) => i !== id);
        delete state.byId[id];
      }
    },

    /** Clear entire agent cache (e.g. on logout). */
    clearAgentCache: () => initialState,
  },
});

// ── Selectors ─────────────────────────────────────────────────────────────────

// Stable empty references — never inline `?? []`, `?? {}`, or `.map().filter()`
// inside a plain selector, as those always produce new references and break memoization.
const EMPTY_IDS: string[] = [];
const EMPTY_AGENTS: AgentRecord[] = [];
const EMPTY_BY_ID: Record<string, AgentRecord> = {};

type WithAgentCache = { agentCache: AgentCacheState };

export const selectAgentById = (
  state: WithAgentCache,
  id: string,
): AgentRecord | undefined => state.agentCache?.byId[id];

export const selectAllAgentsById = (
  state: WithAgentCache,
): Record<string, AgentRecord> => state.agentCache?.byId ?? EMPTY_BY_ID;

// Raw ID arrays — stable because the slice stores them as stable references.
// We fall back to EMPTY_IDS (not `[]`) so the reference never changes when empty.
export const selectOwnedAgentIds = (state: WithAgentCache): string[] =>
  state.agentCache?.ownedIds ?? EMPTY_IDS;

export const selectBuiltinAgentIds = (state: WithAgentCache): string[] =>
  state.agentCache?.builtinIds ?? EMPTY_IDS;

export const selectSharedAgentIds = (state: WithAgentCache): string[] =>
  state.agentCache?.sharedIds ?? EMPTY_IDS;

// Derived agent arrays — must be memoized because .map().filter() always
// allocates a new array, making every call produce a new reference.
const selectAgentsByIdMap = (state: WithAgentCache) => state.agentCache?.byId;

export const selectOwnedAgents = createSelector(
  selectOwnedAgentIds,
  selectAgentsByIdMap,
  (ids, byId): AgentRecord[] => {
    if (!byId || ids.length === 0) return EMPTY_AGENTS;
    return ids.map((id) => byId[id]).filter(Boolean) as AgentRecord[];
  },
);

export const selectBuiltinAgents = createSelector(
  selectBuiltinAgentIds,
  selectAgentsByIdMap,
  (ids, byId): AgentRecord[] => {
    if (!byId || ids.length === 0) return EMPTY_AGENTS;
    return ids.map((id) => byId[id]).filter(Boolean) as AgentRecord[];
  },
);

export const selectSharedAgents = createSelector(
  selectSharedAgentIds,
  selectAgentsByIdMap,
  (ids, byId): AgentRecord[] => {
    if (!byId || ids.length === 0) return EMPTY_AGENTS;
    return ids.map((id) => byId[id]).filter(Boolean) as AgentRecord[];
  },
);

export const selectAgentFetchStatus = (state: WithAgentCache): PerSourceStatus =>
  state.agentCache?.fetchStatus ?? initialState.fetchStatus;

export const selectAgentLastFetchedAt = (
  state: WithAgentCache,
): PerSourceTimestamp =>
  state.agentCache?.lastFetchedAt ?? initialState.lastFetchedAt;

export const selectOwnedHasMore = (state: WithAgentCache): boolean =>
  state.agentCache?.ownedHasMore ?? false;

export const selectSharedHasMore = (state: WithAgentCache): boolean =>
  state.agentCache?.sharedHasMore ?? false;

export const selectOwnedCursor = (state: WithAgentCache): string | null =>
  state.agentCache?.ownedCursor ?? null;

export const selectSharedCursor = (state: WithAgentCache): string | null =>
  state.agentCache?.sharedCursor ?? null;

export const selectAgentError = (state: WithAgentCache): string | null =>
  state.agentCache?.error ?? null;

export const selectIsAgentCacheInitialized = (state: WithAgentCache): boolean => {
  const status = state.agentCache?.fetchStatus;
  if (!status) return false;
  return (
    status.owned !== "idle" ||
    status.builtins !== "idle" ||
    status.shared !== "idle"
  );
};

// ── Operational settings selectors ────────────────────────────────────────────
//
// All four selectors take (state, agentId) and are safe to call even when the
// agent hasn't reached operational depth yet — they return undefined / [] / {}
// in that case. Use these instead of reading agent.settings directly.

const EMPTY_SETTINGS: Record<string, unknown> = {};
const EMPTY_TOOLS: string[] = [];

/** 1. All settings — the full jsonb blob as stored. */
export const selectAgentSettings = (
  state: WithAgentCache,
  agentId: string,
): Record<string, unknown> | undefined =>
  state.agentCache?.byId[agentId]?.settings;

/** 2. model_id — the agent's default model UUID. */
export const selectAgentModelId = (
  state: WithAgentCache,
  agentId: string,
): string | undefined => {
  const s = state.agentCache?.byId[agentId]?.settings;
  return typeof s?.model_id === "string" ? s.model_id : undefined;
};

/** 3. tools — the tools array from settings (empty array when none configured). */
export const selectAgentTools = (
  state: WithAgentCache,
  agentId: string,
): string[] => {
  const raw = state.agentCache?.byId[agentId]?.settings?.tools;
  if (!Array.isArray(raw)) return EMPTY_TOOLS;
  const filtered = raw.filter((t): t is string => typeof t === "string");
  return filtered.length > 0 ? filtered : EMPTY_TOOLS;
};

/**
 * 4. Runtime settings — settings minus model_id and tools.
 * This is what gets sent to the LLM API alongside the chosen model.
 * Returns a stable empty object when there are no remaining keys.
 */
export const selectAgentRuntimeSettings = createSelector(
  (state: WithAgentCache, agentId: string) =>
    state.agentCache?.byId[agentId]?.settings,
  (settings): Record<string, unknown> => {
    if (!settings) return EMPTY_SETTINGS;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { model_id, tools, ...rest } = settings;
    return Object.keys(rest).length > 0 ? rest : EMPTY_SETTINGS;
  },
);

// ── Exports ───────────────────────────────────────────────────────────────────

export const {
  upsertAgentsSlim,
  upsertAgentsCore,
  upsertAgentOperational,
  setAgentFetchStatus,
  setAgentLastFetchedAt,
  setAgentCursors,
  setAgentHasMore,
  setAgentError,
  removeAgent,
  clearAgentCache,
} = agentCacheSlice.actions;

export default agentCacheSlice.reducer;
