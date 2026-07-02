// lib/redux/thunks/agentFetchThunks.ts
//
// Async thunks for the agentCacheSlice.
//
// TTL Strategy:
//   owned prompts : 15 minutes
//   shared prompts: 15 minutes
//   builtins      : session-long (never re-fetched within a session)
//
// Stale-while-revalidate:
//   If a tab is restored after > 4 hours of inactivity, a background
//   re-fetch is triggered for all sources. This is wired in useAgentConsumer
//   via document.visibilitychange.
//
// Idempotency:
//   initializeAgents() is safe to call from multiple components on mount.
//   It checks status + TTL before dispatching any network request.

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { RootState, AppDispatch } from "../store";
import type { DbRpcRow } from "@/types/supabase-rpc";
import { extractErrorMessage } from "@/utils/errors";
import {
  AgentRecord,
  AgentSource,
  upsertAgentsSlim,
  upsertAgentsCore,
  upsertAgentOperational,
  setAgentFetchStatus,
  setAgentLastFetchedAt,
  setAgentCursors,
  setAgentHasMore,
  setAgentError,
} from "../slices/agentCacheSlice";

// ── Constants ─────────────────────────────────────────────────────────────────

const OWNED_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SHARED_TTL_MS = 15 * 60 * 1000; // 15 minutes
const TAB_RESTORE_TTL = 4 * 60 * 60 * 1000; // 4 hours — for stale-while-revalidate

export const AGENT_PAGE_SIZE = 50;

// ── Internal freshness helpers ────────────────────────────────────────────────

function isOwnedFresh(state: RootState): boolean {
  const { fetchStatus, lastFetchedAt } = state.agentCache;
  if (
    fetchStatus.owned === "idle" ||
    fetchStatus.owned === "error"
  )
    return false;
  if (fetchStatus.owned === "loading") return true; // in-flight counts as fresh
  if (!lastFetchedAt.owned) return false;
  return Date.now() - lastFetchedAt.owned < OWNED_TTL_MS;
}

function isBuiltinsFresh(state: RootState): boolean {
  const { fetchStatus } = state.agentCache;
  // Builtins are session-long — once loaded, never re-fetch unless forced
  return (
    fetchStatus.builtins === "success" || fetchStatus.builtins === "loading"
  );
}

function isSharedFresh(state: RootState): boolean {
  const { fetchStatus, lastFetchedAt } = state.agentCache;
  if (
    fetchStatus.shared === "idle" ||
    fetchStatus.shared === "error"
  )
    return false;
  if (fetchStatus.shared === "loading") return true;
  if (!lastFetchedAt.shared) return false;
  return Date.now() - lastFetchedAt.shared < SHARED_TTL_MS;
}

export function isTabStale(state: RootState): boolean {
  const { lastFetchedAt } = state.agentCache;
  const oldest = Math.min(
    lastFetchedAt.owned ?? 0,
    lastFetchedAt.shared ?? 0,
    // builtins: use 0 if never fetched so this triggers correctly
    lastFetchedAt.builtins ?? 0,
  );
  return Date.now() - oldest > TAB_RESTORE_TTL;
}

// ── RPC row → AgentRecord mappers ─────────────────────────────────────────────

interface SlimRow {
  id: string;
  name: string;
  source: string;
}
type _CheckSlimRow = SlimRow extends DbRpcRow<"get_agents_for_chat"> ? true : false;
declare const _slimRow: _CheckSlimRow;
true satisfies typeof _slimRow;

interface SharedSlimRow {
  id: string;
  name: string;
  permission_level: string;
  owner_email: string;
}
type _CheckSharedSlimRow = SharedSlimRow extends DbRpcRow<"agx_get_shared_for_chat"> ? true : false;
declare const _sharedSlimRow: _CheckSharedSlimRow;
true satisfies typeof _sharedSlimRow;

type CoreRow = DbRpcRow<"get_agent_core_batch">;
type _CheckCoreRow = CoreRow extends DbRpcRow<"get_agent_core_batch"> ? true : false;
declare const _coreRow: _CheckCoreRow;
true satisfies typeof _coreRow;

interface OperationalRow {
  id: string;
  source: string;
  variable_defaults: unknown;
  dynamic_model: boolean;
  /** Full settings jsonb (model_id, temperature, tools, thinking_budget, etc.) */
  settings: Record<string, unknown> | null;
}
type _CheckOperationalRow = OperationalRow extends DbRpcRow<"get_agent_operational"> ? true : false;
declare const _operationalRow: _CheckOperationalRow;
true satisfies typeof _operationalRow;

function mapSlimRow(row: SlimRow): AgentRecord {
  return {
    id: row.id,
    source: row.source as AgentSource,
    depth: "slim",
    name: row.name,
  };
}

function mapSharedSlimRow(row: SharedSlimRow): AgentRecord {
  return {
    id: row.id,
    source: "shared",
    depth: "slim",
    name: row.name,
    permissionLevel: row.permission_level as AgentRecord["permissionLevel"],
    ownerEmail: row.owner_email,
  };
}

function mapCoreRow(row: CoreRow): AgentRecord {
  return {
    id: row.id,
    source: row.source as AgentSource,
    depth: "core",
    name: row.name,
    description: row.description ?? undefined,
    tags: row.tags ?? undefined,
    category: row.category ?? undefined,
    isArchived: row.is_archived,
    isFavorite: row.is_favorite,
    isActive: row.is_active,
    outputFormat: row.output_format ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version ?? undefined,
  };
}

function mapOperationalRow(row: OperationalRow): AgentRecord {
  const settings =
    row.settings && Object.keys(row.settings).length > 0
      ? row.settings
      : undefined;
  return {
    id: row.id,
    source: row.source as AgentSource,
    depth: "operational",
    name: "", // merged with existing slim/core data by upsertAgentOperational
    variableDefaults: Array.isArray(row.variable_defaults)
      ? row.variable_defaults
      : [],
    dynamicModel: row.dynamic_model ?? false,
    settings,
  };
}

// ── Thunk 1: fetchAgentSlimList ───────────────────────────────────────────────

/**
 * Fetch slim agent list (Layer 1) for owned prompts + builtins, or shared.
 * For owned/builtins: calls get_agents_for_chat()
 * For shared:         calls agx_get_shared_for_chat()
 */
export const fetchAgentSlimList = createAsyncThunk<
  void,
  { source: "owned" | "shared"; cursor?: string | null },
  { dispatch: AppDispatch; state: RootState }
>("agentCache/fetchSlimList", async ({ source, cursor }, { dispatch }) => {
  const reduxSource = source === "owned" ? "owned" : "shared";
  dispatch(setAgentFetchStatus({ source: reduxSource, status: "loading" }));
  if (source === "owned") {
    // Also mark builtins as loading since this RPC returns both
    dispatch(setAgentFetchStatus({ source: "builtins", status: "loading" }));
  }

  try {
    if (source === "owned") {
      const { data, error } = await supabase.rpc("get_agents_for_chat", {
        p_limit: AGENT_PAGE_SIZE,
        ...(cursor != null ? { p_cursor: cursor } : {}),
      });
      if (error) throw error;

      const rows = (data ?? []) as unknown as SlimRow[];
      const ownedRows = rows
        .filter((r) => r.source === "prompts")
        .map(mapSlimRow);
      const builtinRows = rows
        .filter((r) => r.source === "builtins")
        .map(mapSlimRow);

      if (ownedRows.length > 0 || cursor !== null) {
        dispatch(upsertAgentsSlim(ownedRows));
      }
      if (builtinRows.length > 0) {
        dispatch(upsertAgentsSlim(builtinRows));
      }

      // Pagination: if we got a full page, there may be more
      const lastOwned = ownedRows[ownedRows.length - 1];
      const hasMore = ownedRows.length >= AGENT_PAGE_SIZE;
      dispatch(
        setAgentCursors({ owned: hasMore && lastOwned ? lastOwned.id : null }),
      );
      dispatch(setAgentHasMore({ owned: hasMore }));

      dispatch(setAgentFetchStatus({ source: "owned", status: "success" }));
      dispatch(
        setAgentLastFetchedAt({ source: "owned", timestamp: Date.now() }),
      );
      dispatch(setAgentFetchStatus({ source: "builtins", status: "success" }));
      dispatch(
        setAgentLastFetchedAt({ source: "builtins", timestamp: Date.now() }),
      );
    } else {
      const { data, error } = await supabase.rpc("agx_get_shared_for_chat");
      if (error) throw error;

      const sharedRows = ((data ?? []) as unknown as SharedSlimRow[]).map(
        mapSharedSlimRow,
      );
      dispatch(upsertAgentsSlim(sharedRows));
      dispatch(setAgentHasMore({ shared: false })); // shared is not paginated

      dispatch(setAgentFetchStatus({ source: "shared", status: "success" }));
      dispatch(
        setAgentLastFetchedAt({ source: "shared", timestamp: Date.now() }),
      );
    }

    dispatch(setAgentError(null));
  } catch (err) {
    const message = extractErrorMessage(err);
    dispatch(setAgentError(message));
    dispatch(setAgentFetchStatus({ source: reduxSource, status: "error" }));
    if (source === "owned") {
      dispatch(setAgentFetchStatus({ source: "builtins", status: "error" }));
    }
    throw err;
  }
});

// ── Thunk 2: fetchAgentCoreBatch ──────────────────────────────────────────────

/**
 * Batch-upgrade agents from slim → core depth (Layer 2).
 * Automatically skips agents already at core or operational depth.
 * Call this when the agent picker opens or when the user opens a section.
 */
export const fetchAgentCoreBatch = createAsyncThunk<
  void,
  { agents: Array<{ id: string; source: AgentSource }> },
  { dispatch: AppDispatch; state: RootState }
>("agentCache/fetchCoreBatch", async ({ agents }, { dispatch, getState }) => {
  const state = getState();
  const byId = state.agentCache.byId;

  // Filter to only agents that need upgrading
  const toFetch = agents.filter(({ id }) => {
    const existing = byId[id];
    if (!existing) return true;
    return existing.depth === "slim"; // skip core + operational
  });

  if (toFetch.length === 0) return;

  const ids = toFetch.map((a) => a.id);
  const sources = toFetch.map((a) => a.source);

  const { data, error } = await supabase.rpc("get_agent_core_batch", {
    p_ids: ids,
    p_sources: sources,
  });

  if (error) {
    dispatch(setAgentError(error.message));
    throw error;
  }

  const upgraded = ((data ?? []) as unknown as CoreRow[]).map(mapCoreRow);
  dispatch(upsertAgentsCore(upgraded));
  dispatch(setAgentError(null));
});

// ── Thunk 3: fetchAgentOperational ────────────────────────────────────────────

/**
 * Fetch operational data (Layer 3) for a single agent.
 * Called only when the user actually selects an agent to chat with.
 *
 * Fetches: variable_defaults, dynamic_model, settings (model_id, temperature,
 * tools, thinking_budget, include_thoughts, etc.) via get_agent_operational RPC.
 *
 * Idempotent: skips the fetch if the agent is already at operational depth
 * AND has a settings field (guards against stale cache from before settings
 * were added to the RPC).
 */
export const fetchAgentOperational = createAsyncThunk<
  AgentRecord | null,
  { id: string; source: AgentSource },
  { dispatch: AppDispatch; state: RootState }
>(
  "agentCache/fetchOperational",
  async ({ id, source }, { dispatch, getState }) => {
    const state = getState();
    const existing = state.agentCache?.byId[id];

    // Skip only if we already have the full operational record including settings.
    // Re-fetch if settings is missing (cache pre-dates the settings column addition).
    if (existing?.depth === "operational" && existing.settings !== undefined) {
      return existing;
    }

    const { data, error } = await supabase.rpc("get_agent_operational", {
      p_id: id,
      p_source: source,
    });

    if (error) {
      dispatch(setAgentError(error.message));
      throw error;
    }

    const rows = (data ?? []) as unknown as OperationalRow[];
    if (rows.length === 0) return null;

    const record = mapOperationalRow(rows[0]);
    dispatch(upsertAgentOperational(record));
    dispatch(setAgentError(null));
    return getState().agentCache?.byId[id] ?? null;
  },
);

// ── Thunk 4: initializeAgents ─────────────────────────────────────────────────

/**
 * Bootstrap entry point — safe to call from any component on mount.
 * Orchestrates slim fetches for all three sources in parallel.
 * Respects TTL: owned/shared = 15 min, builtins = session-long.
 *
 * Usage:
 *   useEffect(() => { dispatch(initializeAgents()); }, [dispatch]);
 */
export const initializeAgents = createAsyncThunk<
  void,
  void,
  { dispatch: AppDispatch; state: RootState }
>("agentCache/initialize", async (_, { dispatch, getState }) => {
  const state = getState();

  const ownedFresh = isOwnedFresh(state);
  const builtinsFresh = isBuiltinsFresh(state);
  const sharedFresh = isSharedFresh(state);

  if (ownedFresh && builtinsFresh && sharedFresh) return;

  // owned + builtins come from the same RPC call; shared is separate
  const tasks: Promise<unknown>[] = [];

  if (!ownedFresh || !builtinsFresh) {
    // First page — then drain remaining owned pages sequentially
    await dispatch(fetchAgentSlimList({ source: "owned", cursor: null }));

    // Drain all remaining pages of owned agents
    let keepGoing = true;
    while (keepGoing) {
      const s = getState();
      const hasMore = s.agentCache?.ownedHasMore ?? false;
      const cursor = s.agentCache?.ownedCursor ?? null;
      if (!hasMore || !cursor) break;

      await dispatch(fetchAgentSlimList({ source: "owned", cursor }));

      // Safety: if the fetch didn't advance the cursor, stop
      const nextCursor = getState().agentCache?.ownedCursor ?? null;
      if (nextCursor === cursor) keepGoing = false;
    }
  }

  if (!sharedFresh) {
    tasks.push(dispatch(fetchAgentSlimList({ source: "shared" })));
  }

  await Promise.allSettled(tasks);
});

// ── Thunk 5: refreshAgents ────────────────────────────────────────────────────

/**
 * Force a full re-fetch of all sources, bypassing TTL checks.
 * Call when the user explicitly requests a refresh, or after a tab restore
 * that exceeds the stale-while-revalidate window.
 */
export const refreshAgents = createAsyncThunk<
  void,
  void,
  { dispatch: AppDispatch; state: RootState }
>("agentCache/refresh", async (_, { dispatch }) => {
  await Promise.allSettled([
    dispatch(fetchAgentSlimList({ source: "owned" })),
    dispatch(fetchAgentSlimList({ source: "shared" })),
  ]);
});

// ── Exports ───────────────────────────────────────────────────────────────────

export default {
  fetchAgentSlimList,
  fetchAgentCoreBatch,
  fetchAgentOperational,
  initializeAgents,
  refreshAgents,
};
