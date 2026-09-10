/**
 * Agent Definition — Redux Thunks
 *
 * 🚨 THE LIST IS THE PACKAGE'S (2026-09-08). `@ai-matrx/agents/catalog` owns
 * every agent-list read on this platform — `agx_get_list_full`, `agx_search`,
 * the freshness window, the in-flight dedupe. The four list thunks below are
 * THIN HYDRATORS: they ask the ONE catalog and project its `AgentSummary`
 * rows into this registry as `_fetchStatus: "list"` records, so the ~50
 * non-picker surfaces that read names / the builtin catalogue / gallery rows
 * from `agentDefinition` keep working unchanged. No RPC is issued here, and
 * adding one back is a defect (guard: `pnpm check:agent-list-reads`).
 *
 * Read thunks:
 *   fetchAgentsList              — hydrate the registry from the catalog
 *   fetchAgentsListFull          — same; kept as the picker-era name
 *   fetchSharedAgents            — agents shared with me (for "shared" tab)
 *   fetchSharedAgentsForChat     — minimal shared list for chat agent picker
 *   fetchAgentAccessLevel        — current user's permission level on an agent
 *   fetchAgentExecutionMinimal   — id + variableDefinitions + contextPolicies (skips if ready)
 *   fetchAgentExecutionFull      — adds settings, tools, model (skips if ready)
 *   fetchFullAgent               — complete row, marks record clean
 *   fetchAgentVersionHistory     — paginated version list (returns data, no slice storage)
 *   fetchAgentVersionSnapshot    — full version snapshot → stored in agents map (isVersion = true)
 *   fetchAgentSyncComparison     — identical/differs/unknown verdict for a linked pair
 *
 * Write thunks:
 *   saveAgentField               — optimistic single-field save with rollback
 *   saveAgent                    — save all dirty fields for an agent
 *   createAgent                  — insert new agent
 *   deleteAgent                  — delete agent
 *   purgeAgentVersions           — delete old versions, keep N most recent
 *
 * RPC action thunks:
 *   duplicateAgent               — calls agx_duplicate_agent(), loads copy into state
 *   promoteAgentVersion          — calls agx_promote_version(), reloads live row
 *   updateAgentFromSource        — reset derived agent to its source agent's data
 *
 * Find Usages + Drift Detection moved to features/agents/redux/usages/ — the
 * old agx_check_drift / agx_check_references / agx_accept_version RPCs were
 * replaced by agx_usage_scan / agx_usage_report / agx_usage_update_to_active.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AgentSummary } from "@ai-matrx/agents/catalog";
import { getAgentCatalog } from "@/lib/agents/catalog";
import { runWithSessionRetry } from "@/lib/supabase/authRetry";
import { pgErrorToError } from "@ai-matrx/data";
import { withRetry } from "@ai-matrx/data/net";
import { ConnectTimeoutError } from "@ai-matrx/data/net";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Database } from "@/types/database.types";
import type { DbRpcRow } from "@/types/supabase-rpc";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  compareAgentSyncSnapshots,
  type AgentSyncComparison,
} from "@/features/agents/sync/compare";
import {
  AGENT_SYNC_SNAPSHOT_SELECT,
  toAgentSyncSnapshot,
} from "@/features/agents/sync/sync-fields";
import type {
  AgentDefinition,
  AgentListRow,
  AgentSearchRow,
  AgentExecutionMinimal,
  AgentExecutionFull,
  UpdateFromSourceResult,
  PromoteVersionResult,
  AgentVersionLookup,
  LinkedAgentRef,
  LinkedCounterpartResult,
  PersonalCopyResult,
} from "../../types/agent-definition.types";
import { isSyntheticAgentId } from "./synthetic-id";
import { parseAgentVersionSnapshot } from "./parse-output-snapshot";
import { assignField } from "@/features/agents/redux/shared/field-flags";
import {
  upsertAgent,
  mergePartialAgent,
  setAgentField,
  setAgentFetchStatus,
  setAgentLoading,
  setAgentError,
  setAgentsStatus,
  setAgentsError,
  markAgentSaved,
  rollbackAgentOptimisticUpdate,
  removeAgent,
} from "./slice";
import {
  selectAgentById,
  selectAgentExecutionPayload,
  selectAgentCustomExecutionPayload,
} from "./selectors";
import {
  dbRowToAgentDefinition,
  agentDefinitionToInsert,
  agentDefinitionToUpdate,
  versionSnapshotRowToAgentDefinition,
} from "./converters";

type ThunkApi = { dispatch: AppDispatch; state: RootState };

const AGENT_LIST_RPC_PAGE_SIZE = 100;

/**
 * Cap on rows returned by one server search. Generous — the point of server
 * search is to reach agents the client never loaded, so a tight cap would
 * reintroduce the very blindness this exists to fix.
 */
const AGENT_SEARCH_LIMIT = 200;

/** The registry's closed `access_level` vocabulary. */
const REGISTRY_ACCESS_LEVELS = [
  "owner",
  "admin",
  "editor",
  "viewer",
  "system",
] as const;

type RegistryAccessLevel = (typeof REGISTRY_ACCESS_LEVELS)[number];

function toRegistryAccessLevel(value: string | null): RegistryAccessLevel | null {
  return (
    REGISTRY_ACCESS_LEVELS.find(
      (level): level is RegistryAccessLevel => level === value,
    ) ?? null
  );
}

/**
 * Project the package catalog's rows into this registry. Field names are the
 * registry's own, unchanged — `AgentSummary` is already the camelCased
 * `agx_get_list_full` row, so this is a rename-free copy plus the two flags
 * the registry owns (`isVersion`, `_fetchStatus`).
 */
function mergeAgentSummaries(
  dispatch: AppDispatch,
  rows: readonly AgentSummary[],
) {
  for (const row of rows) {
    dispatch(
      mergePartialAgent({
        id: row.id,
        name: row.name ?? undefined,
        description: row.description,
        category: row.category,
        tags: row.tags,
        agentType: row.agentType,
        modelId: row.modelId,
        isActive: row.isActive,
        isArchived: row.isArchived,
        isFavorite: row.isFavorite,
        // The registry spells "absent" as `undefined` where the DB row spells
        // it `null`. Five fields differ; this is the vocabulary translation
        // at the seam, not a value change.
        createdBy: row.createdBy ?? undefined,
        organizationId: row.organizationId ?? undefined,
        taskId: row.taskId,
        sourceAgentId: row.sourceAgentId,
        createdAt: row.createdAt ?? undefined,
        updatedAt: row.updatedAt ?? undefined,
        isVersion: false,
        isOwner: row.isOwner,
        // `access_level` is a DB-owned vocabulary the package deliberately
        // leaves open (an unknown level renders as itself). This registry's
        // field is a closed union, so an unrecognised level is stored as
        // `null` — absent, never silently coerced into a wrong level.
        accessLevel: toRegistryAccessLevel(row.accessLevel),
        sharedByEmail: row.sharedByEmail ?? undefined,
      }),
    );
    dispatch(setAgentFetchStatus({ id: row.id, status: "list" }));
  }
}

// ---------------------------------------------------------------------------
// Read thunks
// ---------------------------------------------------------------------------

/**
 * Hydrates this registry from the ONE agent catalog. The gallery, the agent
 * pages, and every name-resolving surface read `agentDefinition`; the catalog
 * reads the database. This is the seam between them.
 *
 * The catalog's own freshness window and in-flight dedupe make this safe to
 * dispatch on every mount — no thunk-level TTL guard is needed or wanted.
 */
export const fetchAgentsList = createAsyncThunk<void, void, ThunkApi>(
  "agentDefinition/fetchList",
  async (_, { dispatch }) => {
    dispatch(setAgentsStatus("loading"));
    const catalog = getAgentCatalog();
    try {
      await catalog.ensureLoaded();
    } catch (e) {
      dispatch(setAgentsError(e instanceof Error ? e.message : String(e)));
      dispatch(setAgentsStatus("failed"));
      throw e;
    }
    mergeAgentSummaries(dispatch, catalog.getState().rows);
    dispatch(setAgentsStatus("succeeded"));
  },
);

/**
 * Server-side agent search — the canonical path for finding an agent.
 *
 * WHY THIS EXISTS: the list is paginated. Filtering only what the client has
 * already loaded silently reports "no results" for agents that were simply
 * never fetched. Any paginated collection therefore needs a server search.
 *
 * ADDITIVE BY CONTRACT: results go through `mergeAgentListRows`, the same
 * merge the list fetch uses. Rows are ADDED to the store and existing records
 * are enriched, never replaced or evicted. Local matches keep rendering
 * instantly while this resolves, then server-only matches fold in beneath
 * them — nothing the user is already looking at disappears.
 *
 * Two tiers:
 *   deep = false (default) — name, description, category, tags, model, id
 *   deep = true            — the above PLUS the agent's own prompt content
 *
 * Tier 2 is a strict superset and prompt hits always score below every tier-1
 * field, so enabling it can only append below the obvious matches.
 *
 * Returns the matched ids in server rank order so a caller can preserve
 * server relevance ordering if it wants to.
 */
export const searchAgentsServer = createAsyncThunk<
  { ids: string[]; deep: boolean; query: string },
  { query: string; deep?: boolean; limit?: number },
  ThunkApi
>(
  "agentDefinition/searchServer",
  async ({ query, deep = false }, { dispatch }) => {
    const q = query.trim();
    if (!q) return { ids: [], deep, query: q };

    const catalog = getAgentCatalog();
    const ids = await catalog.searchServer(q, deep);

    // The catalog merges its hits into its own registry; project them here so
    // a name the search just discovered resolves on every non-picker surface.
    const state = catalog.getState();
    mergeAgentSummaries(
      dispatch,
      ids.map((id) => state.byId[id]).filter((r): r is AgentSummary => !!r),
    );

    return { ids, deep, query: q };
  },
);

/**
 * The picker-era name for the same hydration. Kept because ~20 surfaces
 * dispatch it by name; it is `fetchAgentsList` with no status writes, because
 * a picker's own loading state comes from the package now.
 */
export const fetchAgentsListFull = createAsyncThunk<void, void, ThunkApi>(
  "agentDefinition/fetchListFull",
  async (_, { dispatch }) => {
    const catalog = getAgentCatalog();
    await catalog.ensureLoaded();
    mergeAgentSummaries(dispatch, catalog.getState().rows);
  },
);

/**
 * Fetches the minimal execution payload for an agent: id, variableDefinitions, contextPolicies.
 *
 * Skips the network call if both fields are already loaded (isReady = true).
 * Call this before executing an agent from a context menu shortcut.
 */
export const fetchAgentExecutionMinimal = createAsyncThunk<
  void,
  string,
  ThunkApi
>(
  "agentDefinition/fetchExecutionMinimal",
  async (agentId, { dispatch, getState }) => {
    if (selectAgentExecutionPayload(getState(), agentId).isReady) return;

    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await withRetry(
      () =>
        new Promise<
          Awaited<ReturnType<typeof supabase.rpc<"agx_get_execution_minimal">>>
        >((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new ConnectTimeoutError(15_000));
          }, 15_000);
          supabase
            .rpc("agx_get_execution_minimal", { p_agent_id: agentId })
            .then(
              (result) => {
                clearTimeout(timer);
                resolve(result);
              },
              (err) => {
                clearTimeout(timer);
                reject(err);
              },
            );
        }),
      { attempts: 2, initialDelayMs: 400 },
    );

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw pgErrorToError(error);
    }

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return;
    const row = raw as unknown as AgentExecutionMinimal;

    dispatch(
      mergePartialAgent({
        id: row.id,
        variableDefinitions: row.variable_definitions,
        contextPolicies: row.context_policies ?? [],
      }),
    );
    dispatch(setAgentFetchStatus({ id: row.id, status: "execution" }));
  },
);

/**
 * Fetches the full execution payload: adds settings, tools, customTools, modelId.
 * Used by the agent builder preview pane and pages that allow pre-run configuration.
 *
 * Skips if all required fields are already loaded.
 */
export const fetchAgentExecutionFull = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/fetchExecutionFull",
  async (agentId, { dispatch, getState }) => {
    if (selectAgentCustomExecutionPayload(getState(), agentId).isReady) return;

    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await supabase.rpc("agx_get_execution_full", {
      p_agent_id: agentId,
    });

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw pgErrorToError(error);
    }

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return;
    const row = raw as unknown as AgentExecutionFull;

    dispatch(
      mergePartialAgent({
        id: row.id,
        variableDefinitions: row.variable_definitions,
        contextPolicies: row.context_policies ?? [],
        settings: row.settings,
        tools: row.tools,
        customTools: row.custom_tools,
        modelId: row.model_id,
        uiGates: row.ui_gates ?? {},
      }),
    );
    dispatch(setAgentFetchStatus({ id: row.id, status: "customExecution" }));
  },
);

/**
 * Fetches the complete agent row via PostgREST and upserts it into state.
 * Marks the record fully clean — all fields tracked as loaded.
 * Use this when opening the agent builder or after creating/duplicating an agent.
 */
export const fetchFullAgent = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/fetchFull",
  async (agentId, { dispatch }) => {
    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .select("*")
      .eq("id", agentId)
      .single();

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw pgErrorToError(error);
    }

    dispatch(upsertAgent(dbRowToAgentDefinition(data)));
  },
);

// ---------------------------------------------------------------------------
// Version read thunks
// ---------------------------------------------------------------------------

/**
 * One `agx_get_version_history` row.
 *
 * Nullability mirrors the LIVE COLUMNS of `agent.definition_version`, not the
 * generated row — Supabase marks every `RETURNS TABLE` column non-null because
 * Postgres carries no nullability on an OUT parameter. Consumers must handle
 * the nulls; they are the normal case for a change note and for every contract
 * field on a version saved before contracts existed. See
 * `parse-output-snapshot.ts` § THE RETURNS-TABLE NULLABILITY LIE.
 */
export interface AgentVersionHistoryItem {
  version_id: string;
  version_number: number;
  name: string;
  changed_at: string;
  change_note: string | null;
  contract_change: string | null;
  contract_break_declared: string | null;
  input_contract_hash: string | null;
  output_contract_hash: string | null;
}
/** Same generator-vs-table reconciliation as the snapshot row's shim. */
type AgentVersionHistoryItemDbProjection = Omit<
  AgentVersionHistoryItem,
  | "change_note"
  | "contract_change"
  | "contract_break_declared"
  | "input_contract_hash"
  | "output_contract_hash"
> & {
  change_note: string;
  contract_change: string;
  contract_break_declared: string;
  input_contract_hash: string;
  output_contract_hash: string;
};
type _Check_AgentVersionHistoryItem =
  AgentVersionHistoryItemDbProjection extends DbRpcRow<"agx_get_version_history">
    ? true
    : false;
declare const _agentVersionHistoryItem: _Check_AgentVersionHistoryItem;
true satisfies typeof _agentVersionHistoryItem;

// AgentVersionSnapshot interface + compile-time check now live in
// features/agents/types/agent-definition.types.ts

/**
 * Paginated version history for the agent editor's version panel.
 * Returns the list directly — not stored in Redux (ephemeral UI state).
 */
export const fetchAgentVersionHistory = createAsyncThunk<
  AgentVersionHistoryItem[],
  { agentId: string; limit?: number; offset?: number },
  ThunkApi
>(
  "agentDefinition/fetchVersionHistory",
  async ({ agentId, limit = 50, offset = 0 }) => {
    const { data, error } = await supabase.rpc("agx_get_version_history", {
      p_agent_id: agentId,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) throw pgErrorToError(error);

    return (data ?? []) as AgentVersionHistoryItem[];
  },
);

/**
 * Resolves an immutable agent-version UUID to its parent agent and numeric
 * version. Unlike version history, callers do not need to know the parent
 * agent first. RLS on agent.definition_version remains the authorization
 * boundary for this lookup.
 */
export const resolveAgentVersionId = createAsyncThunk<
  AgentVersionLookup | null,
  string,
  ThunkApi
>("agentDefinition/resolveVersionId", async (versionId) => {
  const { data, error } = await supabase
    .schema("agent")
    .from("definition_version")
    .select("id, agent_id, version_number, name")
    .eq("id", versionId)
    .maybeSingle();

  if (error) throw pgErrorToError(error);
  if (!data) return null;

  return {
    versionId: data.id,
    agentId: data.agent_id,
    versionNumber: data.version_number,
    agentName: data.name,
  };
});

/**
 * Fetches a full version snapshot for diff/preview.
 * Stores it in the agents map with isVersion = true, keyed by agx_version.id.
 * Same record shape — no special handling needed in selectors or UI.
 */
export const fetchAgentVersionSnapshot = createAsyncThunk<
  void,
  { agentId: string; version: number },
  ThunkApi
>(
  "agentDefinition/fetchVersionSnapshot",
  async ({ agentId, version }, { dispatch }) => {
    const { data, error } = await supabase.rpc("agx_get_version_snapshot", {
      p_agent_id: agentId,
      p_version_number: version,
    });

    if (error) throw pgErrorToError(error);

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return;
    const row = parseAgentVersionSnapshot(raw);

    dispatch(upsertAgent(versionSnapshotRowToAgentDefinition(agentId, row)));
  },
);

// ---------------------------------------------------------------------------
// Write thunks
// ---------------------------------------------------------------------------

/**
 * Optimistically saves a single field on an agent.
 * Immediately updates state, persists to DB, rolls back on failure.
 *
 * Use for simple inline edits (name, description, isActive toggle, etc.).
 */
export const saveAgentField = createAsyncThunk<
  void,
  {
    agentId: string;
    field: keyof AgentDefinition;
    value: AgentDefinition[keyof AgentDefinition];
  },
  ThunkApi
>(
  "agentDefinition/saveField",
  async ({ agentId, field, value }, { dispatch, getState }) => {
    // Synthetic comparison/variation agents (`cmp-` ids) live only in Redux
    // and must never hit the DB. The builder editing components reused by
    // those features dispatch field-setters directly (not this thunk), so in
    // practice this never fires — it makes the no-persist guarantee structural.
    if (isSyntheticAgentId(agentId)) {
      dispatch(setAgentField({ id: agentId, field, value }));
      return;
    }

    const existing = selectAgentById(getState(), agentId);
    const snapshot = existing ? { [field]: existing[field] } : {};

    dispatch(setAgentField({ id: agentId, field, value }));

    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .update(
        agentDefinitionToUpdate({ [field]: value } as Partial<AgentDefinition>),
      )
      .eq("id", agentId)
      .select("version, updated_at")
      .single();

    if (error) {
      dispatch(rollbackAgentOptimisticUpdate({ id: agentId, snapshot }));
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw pgErrorToError(error);
    }

    if (data) {
      dispatch(
        mergePartialAgent({
          id: agentId,
          version: data.version,
          updatedAt: data.updated_at,
        }),
      );
    }

    dispatch(markAgentSaved({ id: agentId }));
  },
);

/**
 * Toggles the agent's `auto_tools_disabled` kill switch — the inverse of the
 * Builder's "Allow automated tool injection" switch.
 *
 * Persists into `agent.definition.tool_config.auto_tools_disabled` via a
 * read-merge-write so sibling tool_config keys (`excluded_tools`) are never
 * clobbered. Strips the dead `tools` key if present — tool assignment lives
 * on `agent.definition.tools` / `custom_tools`, never in tool_config. The
 * server reads this flag from tool_config (agx_manager.py); there is no
 * dedicated column, so a targeted merge is the correct write. Optimistic via
 * mergePartialAgent (does NOT mark dirty); reverted on failure.
 */
export const setAgentAutoToolsDisabled = createAsyncThunk<
  void,
  { agentId: string; disabled: boolean },
  ThunkApi
>(
  "agentDefinition/setAutoToolsDisabled",
  async ({ agentId, disabled }, { dispatch, getState }) => {
    const previous =
      selectAgentById(getState(), agentId)?.autoToolsDisabled ?? false;

    // Optimistic — value updates immediately without being marked dirty.
    dispatch(mergePartialAgent({ id: agentId, autoToolsDisabled: disabled }));

    // Synthetic comparison/variation agents live only in Redux — never persist.
    if (isSyntheticAgentId(agentId)) return;

    const { data: current, error: readError } = await supabase
      .schema("agent")
      .from("definition")
      .select("tool_config")
      .eq("id", agentId)
      .single();

    if (readError) {
      dispatch(mergePartialAgent({ id: agentId, autoToolsDisabled: previous }));
      dispatch(setAgentError({ id: agentId, error: readError.message }));
      throw pgErrorToError(readError);
    }

    const existingConfig =
      current?.tool_config &&
      typeof current.tool_config === "object" &&
      !Array.isArray(current.tool_config)
        ? { ...(current.tool_config as Record<string, unknown>) }
        : {};
    // Dead key — never re-persist; assignment is agent.definition.tools.
    delete existingConfig.tools;

    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .update({
        tool_config: {
          ...existingConfig,
          auto_tools_disabled: disabled,
        } as Database["agent"]["Tables"]["definition"]["Update"]["tool_config"],
      })
      .eq("id", agentId)
      .select("version, updated_at")
      .single();

    if (error) {
      dispatch(mergePartialAgent({ id: agentId, autoToolsDisabled: previous }));
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw pgErrorToError(error);
    }

    if (data) {
      dispatch(
        mergePartialAgent({
          id: agentId,
          version: data.version,
          updatedAt: data.updated_at,
        }),
      );
    }
  },
);

/**
 * Toggles the agent's `auto_context_disabled` kill switch — the inverse of the
 * Builder's "Allow automated context injection" switch, and the exact mirror of
 * `setAgentAutoToolsDisabled` above.
 *
 * Unlike the tools switch (which lives inside the `tool_config` JSONB and needs
 * a read-merge-write), this is a first-class column on `agent.definition`, so a
 * targeted update is the whole write. Optimistic via mergePartialAgent (does
 * NOT mark dirty); reverted on failure.
 *
 * Semantics — three states the author can be in:
 *   - no policies declared, switch off  → all context flows, delivered normally
 *   - policies declared, switch off     → those govern their keys, extras flow
 *   - switch ON                         → ONLY declared policies deliver
 *
 * A gate may only NARROW: a Mandate can close what this agent would accept, but
 * can never reopen what the agent refused.
 */
export const setAgentAutoContextDisabled = createAsyncThunk<
  void,
  { agentId: string; disabled: boolean },
  ThunkApi
>(
  "agentDefinition/setAutoContextDisabled",
  async ({ agentId, disabled }, { dispatch, getState }) => {
    const previous =
      selectAgentById(getState(), agentId)?.autoContextDisabled ?? false;

    // Optimistic — value updates immediately without being marked dirty.
    dispatch(mergePartialAgent({ id: agentId, autoContextDisabled: disabled }));

    // Synthetic comparison/variation agents live only in Redux — never persist.
    if (isSyntheticAgentId(agentId)) return;

    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .update({ auto_context_disabled: disabled })
      .eq("id", agentId)
      .select("version, updated_at")
      .single();

    if (error) {
      dispatch(
        mergePartialAgent({ id: agentId, autoContextDisabled: previous }),
      );
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw pgErrorToError(error);
    }

    if (data) {
      dispatch(
        mergePartialAgent({
          id: agentId,
          version: data.version,
          updatedAt: data.updated_at,
        }),
      );
    }
  },
);

/**
 * Saves all dirty fields for an agent in a single DB update.
 * Reads dirty field values from state — no arg needed beyond agentId.
 *
 * Use after the user finishes editing in the agent builder.
 */
export const saveAgent = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/save",
  async (agentId, { dispatch, getState }) => {
    // Synthetic comparison/variation agents never persist — see saveAgentField.
    if (isSyntheticAgentId(agentId)) return;
    const record = selectAgentById(getState(), agentId);
    if (!record || !record._dirty) return;

    const dirtyPartial: Partial<AgentDefinition> = {};
    for (const field of Object.keys(
      record._dirtyFields,
    ) as (keyof AgentDefinition)[]) {
      assignField(dirtyPartial, field, record[field]);
    }

    const snapshot = { ...record._fieldHistory };

    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .update(agentDefinitionToUpdate(dirtyPartial))
      .eq("id", agentId)
      .select("version, updated_at")
      .single();

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(rollbackAgentOptimisticUpdate({ id: agentId, snapshot }));
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw pgErrorToError(error);
    }

    if (data) {
      dispatch(
        mergePartialAgent({
          id: agentId,
          version: data.version,
          updatedAt: data.updated_at,
        }),
      );
    }

    dispatch(markAgentSaved({ id: agentId }));
  },
);

/**
 * Creates a new agent and loads the returned row into state.
 * createdBy is pulled from Redux — not passed by the caller.
 */
export const createAgent = createAsyncThunk<
  string,
  Partial<
    Omit<
      AgentDefinition,
      | "id"
      | "createdBy"
      | "createdAt"
      | "updatedAt"
      | "isVersion"
      | "parentAgentId"
      | "version"
      | "changedAt"
      | "changeNote"
    >
  >,
  ThunkApi
>("agentDefinition/create", async (partial, { dispatch, getState }) => {
  const userId = selectUserId(getState());

  const draft: AgentDefinition = {
    id: "",
    name: partial.name ?? "Untitled Agent",
    description: partial.description ?? null,
    category: partial.category ?? null,
    tags: partial.tags ?? [],
    isActive: partial.isActive ?? true,
    isArchived: partial.isArchived ?? false,
    isFavorite: partial.isFavorite ?? false,
    agentType: partial.agentType ?? "user",

    // New agents are never version snapshots
    isVersion: false,
    parentAgentId: null,
    version: null,
    changedAt: null,
    changeNote: null,

    modelId: partial.modelId ?? null,
    messages: partial.messages ?? [],
    variableDefinitions: partial.variableDefinitions ?? null,
    settings: partial.settings ?? ({} as AgentDefinition["settings"]),
    tools: partial.tools ?? [],
    contextPolicies: partial.contextPolicies ?? [],
    autoContextDisabled: partial.autoContextDisabled ?? false,
    inputKind: partial.inputKind ?? null,
    modelTiers: partial.modelTiers ?? null,
    outputSchema: partial.outputSchema ?? null,
    customTools: partial.customTools ?? [],
    autoToolsDisabled: partial.autoToolsDisabled ?? false,
    skillConfig: partial.skillConfig ?? {
      included: [],
      listed: [],
      forbidden: [],
      disabled: false,
    },
    uiGates: partial.uiGates ?? {},
    matrxDirectives: partial.matrxDirectives ?? {},
    mcpServers: partial.mcpServers ?? [],
    createdBy: userId,
    organizationId: partial.organizationId ?? null,
    taskId: partial.taskId ?? null,
    sourceAgentId: null,
    sourceSnapshotAt: null,
    createdAt: "",
    updatedAt: "",

    // Caller owns the record they're creating
    isOwner: true,
    accessLevel: "owner",
    sharedByEmail: null,

    // Default 0 boost — user picks a non-zero value in Settings if they
    // want this agent's derivatives to outrank raw extracts in Knowledge.
    defaultRagBoost: partial.defaultRagBoost ?? 0,
    ragAwarenessMode: partial.ragAwarenessMode ?? "none",
  };

  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .insert(agentDefinitionToInsert(draft))
    .select()
    .single();

  if (error) throw pgErrorToError(error);

  const newAgent = dbRowToAgentDefinition(data);
  dispatch(upsertAgent(newAgent));
  return newAgent.id;
});

/**
 * Soft-deletes an agent (sets `deleted_at`) and removes it from state.
 *
 * Platform standard: never hard-delete. The gallery readers (`agx_get_list`,
 * `agx_search`) already exclude rows with `deleted_at IS NOT NULL`, so the
 * agent disappears everywhere while remaining restorable in the DB.
 */
export const deleteAgent = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/delete",
  async (agentId, { dispatch }) => {
    const { error } = await supabase
      .schema("agent")
      .from("definition")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", agentId);

    if (error) throw pgErrorToError(error);

    dispatch(removeAgent(agentId));
  },
);

// ---------------------------------------------------------------------------
// RPC action thunks
// ---------------------------------------------------------------------------

/**
 * Duplicates an agent via the `agx_duplicate_agent` RPC and loads the copy into state.
 * Returns the new agent's id.
 *
 * Accepts either a bare agent id (legacy callers) or an options object so that
 * admin surfaces can opt into preserving system status:
 *
 *   dispatch(duplicateAgent(agentId))                          // user copy
 *   dispatch(duplicateAgent({ agentId, asSystem: true }))      // system copy
 *
 * `asSystem: true` is admin-only — the RPC verifies `is_super_admin()` and
 * rejects otherwise. When set, the new row is inserted as a builtin system
 * agent (`agent_type = 'builtin'`, no owner). Default is the historical
 * "personal copy" behavior so existing callers keep working unchanged.
 */
export interface DuplicateAgentOptions {
  agentId: string;
  asSystem?: boolean;
}

export const duplicateAgent = createAsyncThunk<
  string,
  string | DuplicateAgentOptions,
  ThunkApi
>("agentDefinition/duplicate", async (input, { dispatch }) => {
  const { agentId, asSystem } =
    typeof input === "string" ? { agentId: input, asSystem: false } : input;

  const { data, error } = await supabase.rpc("agx_duplicate_agent", {
    p_agent_id: agentId,
    p_as_system: Boolean(asSystem),
  });

  if (error) throw pgErrorToError(error);

  const newAgentId = data as string;
  await dispatch(fetchFullAgent(newAgentId));
  return newAgentId;
});

/**
 * Duplicates the EXACT pinned `agx_version` snapshot a server uses — not the
 * (possibly drifted/corrupted) master row — into a new editable agent.
 *
 * Use this wherever a "fork the agent the server actually runs" is needed:
 * the research pipeline pins specific versions per role (`research/agents.py`),
 * so forking the master via `duplicateAgent` would hand the user a different
 * agent. Calls the `agx_duplicate_version` RPC and loads the copy into state.
 */
export const duplicateAgentVersion = createAsyncThunk<
  string,
  { versionId: string; asSystem?: boolean },
  ThunkApi
>(
  "agentDefinition/duplicateVersion",
  async ({ versionId, asSystem }, { dispatch }) => {
    const { data, error } = await supabase.rpc("agx_duplicate_version", {
      p_version_id: versionId,
      p_as_system: Boolean(asSystem),
    });

    if (error) throw pgErrorToError(error);

    const newAgentId = data as string;
    await dispatch(fetchFullAgent(newAgentId));
    return newAgentId;
  },
);

/**
 * Promotes a past version to be the live agent via `agx_promote_version`.
 * Reloads the live agents row after promotion so state reflects the promoted data.
 */
export const promoteAgentVersion = createAsyncThunk<
  PromoteVersionResult,
  { agentId: string; version: number },
  ThunkApi
>(
  "agentDefinition/promoteVersion",
  async ({ agentId, version }, { dispatch }) => {
    const { data, error } = await supabase.rpc("agx_promote_version", {
      p_agent_id: agentId,
      p_version_number: version,
    });

    if (error) throw pgErrorToError(error);

    const result = data as unknown as PromoteVersionResult;

    if (result.success) {
      await dispatch(fetchFullAgent(agentId));
    }

    return result;
  },
);

// ---------------------------------------------------------------------------
// Shared agents
// ---------------------------------------------------------------------------

export interface SharedAgentItem {
  id: string;
  name: string;
  description: string | null;
  agent_type: "user" | "builtin";
  category: string | null;
  tags: string[];
  owner_id: string | null;
  owner_email: string | null;
  permission_level: string;
  created_at: string;
  updated_at: string;
}

export interface SharedAgentForChat {
  id: string;
  name: string;
  permission_level: string;
  owner_email: string | null;
}

/**
 * Fetches all agents shared with the current user (not owned by them).
 *
 * @deprecated agx_get_list() now returns both owned and shared agents in one
 * call with full access metadata. Prefer fetchAgentsList() instead.
 * This thunk is kept for cases where only the shared subset is needed
 * (e.g. a targeted refresh of the "Shared with me" tab without re-fetching owned agents).
 */
export const fetchSharedAgents = createAsyncThunk<
  SharedAgentItem[],
  void,
  ThunkApi
>("agentDefinition/fetchShared", async (_, { dispatch }) => {
  const { data, error } = await supabase.rpc("agx_get_shared_with_me");

  if (error) throw pgErrorToError(error);

  const rows = (data ?? []) as SharedAgentItem[];

  for (const row of rows) {
    dispatch(
      mergePartialAgent({
        id: row.id,
        name: row.name ?? undefined,
        description: row.description,
        category: row.category,
        tags: row.tags ?? [],
        agentType: row.agent_type,
        isVersion: false,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isOwner: false,
        accessLevel: row.permission_level as AgentDefinition["accessLevel"],
        sharedByEmail: row.owner_email,
      }),
    );
    dispatch(setAgentFetchStatus({ id: row.id, status: "list" }));
  }

  return rows;
});

/**
 * Fetches the minimal shared agent list for the chat agent picker.
 * Returns the raw list — lightweight, not stored in slice
 * (the picker only needs name + id, no need to hydrate execution fields).
 */
export const fetchSharedAgentsForChat = createAsyncThunk<
  SharedAgentForChat[],
  void,
  ThunkApi
>("agentDefinition/fetchSharedForChat", async () => {
  const { data, error } = await supabase.rpc("agx_get_shared_for_chat");

  if (error) throw pgErrorToError(error);

  return (data ?? []) as SharedAgentForChat[];
});

// ---------------------------------------------------------------------------
// Access level
// ---------------------------------------------------------------------------

export interface AgentAccessLevel {
  agent_id: string;
  agent_name: string;
  owner_id: string;
  owner_email: string;
  access_level: "owner" | "admin" | "editor" | "viewer" | "public" | "none";
  is_owner: boolean;
}
type _Check_AgentAccessLevel =
  AgentAccessLevel extends DbRpcRow<"agx_get_access_level"> ? true : false;
declare const _agentAccessLevel: _Check_AgentAccessLevel;
true satisfies typeof _agentAccessLevel;

/**
 * Returns the current user's permission level on a specific agent.
 * Also merges the result into the slice so selectors stay consistent.
 *
 * Use when opening the agent builder, or when the record arrived via a
 * shortcut/execution RPC (which don't include access metadata).
 */
export const fetchAgentAccessLevel = createAsyncThunk<
  AgentAccessLevel,
  string,
  ThunkApi
>("agentDefinition/fetchAccessLevel", async (agentId, { dispatch }) => {
  const { data, error } = await runWithSessionRetry(() =>
    supabase.rpc("agx_get_access_level", {
      p_agent_id: agentId,
    }),
  );

  if (error) throw pgErrorToError(error);

  const rawRow = Array.isArray(data) ? data[0] : data;
  if (!rawRow) throw new Error(`No access level returned for agent ${agentId}`);
  const row = rawRow as AgentAccessLevel;

  // Merge into slice so selectors reflect the current access state
  dispatch(
    mergePartialAgent({
      id: agentId,
      isOwner: row.is_owner,
      accessLevel: row.access_level,
      sharedByEmail: row.is_owner ? null : null, // not returned by this RPC
    }),
  );

  return row;
});

// ---------------------------------------------------------------------------
// Version management
// ---------------------------------------------------------------------------

export interface PurgeVersionsResult {
  success: boolean;
  error?: string;
  deleted_count?: number;
  kept_count?: number;
}
// agx_purge_versions returns Json directly — no DB row schema to check.

/**
 * Deletes old versions for an agent, keeping the N most recent.
 * The RPC always preserves: version 1, the current live version,
 * and any version pinned by a shortcut or app.
 *
 * keepCount defaults to 10 if not provided (matches the RPC default).
 */
export const purgeAgentVersions = createAsyncThunk<
  PurgeVersionsResult,
  { agentId: string; keepCount?: number },
  ThunkApi
>("agentDefinition/purgeVersions", async ({ agentId, keepCount }) => {
  const params: { p_agent_id: string; p_keep_count?: number } = {
    p_agent_id: agentId,
  };
  if (keepCount !== undefined) params.p_keep_count = keepCount;

  const { data, error } = await supabase.rpc("agx_purge_versions", params);

  if (error) throw pgErrorToError(error);

  return data as unknown as PurgeVersionsResult;
});

// ---------------------------------------------------------------------------
// Chat sidebar bootstrap
// ---------------------------------------------------------------------------

/**
 * THE FRESHNESS IS THE PACKAGE'S. `isChatListFresh` and its module-level
 * timestamp are gone: the catalog owns the 15-minute TTL and the 4-hour
 * tab-restore threshold, so there is exactly one answer to "is the list
 * stale" on this platform.
 */
export function isChatListStale(): boolean {
  return getAgentCatalog().isStale();
}

/**
 * Initializes the agent catalogue for the chat sidebar and hydrates this
 * registry from it. Safe to call on every mount — the catalog's own TTL and
 * shared in-flight promise collapse concurrent mounts to one read.
 *
 * Usage:
 *   dispatch(initializeChatAgents())                 // skip if fresh
 *   dispatch(initializeChatAgents({ force: true }))  // always re-read
 */
export const initializeChatAgents = createAsyncThunk<
  void,
  { force?: boolean } | void,
  ThunkApi
>(
  "agentDefinition/initializeChatAgents",
  async (arg, { dispatch }) => {
    const force = (arg as { force?: boolean } | undefined)?.force ?? false;
    const catalog = getAgentCatalog();
    await catalog.ensureLoaded(force ? { force: true } : undefined);
    mergeAgentSummaries(dispatch, catalog.getState().rows);
  },
);

/**
 * Resets a derived agent back to its source agent's current data.
 * Use on the "update from source" button in the agent builder.
 * On success, reloads the agent row to reflect the reset data.
 */
export const updateAgentFromSource = createAsyncThunk<
  UpdateFromSourceResult,
  string,
  ThunkApi
>("agentDefinition/updateFromSource", async (agentId, { dispatch }) => {
  const { data, error } = await supabase.rpc("agx_update_from_source", {
    p_agent_id: agentId,
  });

  if (error) throw pgErrorToError(error);

  const result = data as unknown as UpdateFromSourceResult;

  if (result.success) {
    // Reload the live row — it now holds the source agent's data
    await dispatch(fetchFullAgent(agentId));
  }

  return result;
});

// ---------------------------------------------------------------------------
// Linked agents — bidirectional sync (user agent ⇄ system/builtin agent)
// ---------------------------------------------------------------------------

const LINKED_REF_COLS =
  "id, agent_type, name, source_agent_id, source_snapshot_at, updated_at, created_by, deleted_at";

interface LinkedRefRow {
  id: string;
  agent_type: "user" | "builtin";
  name: string;
  source_agent_id: string | null;
  source_snapshot_at: string | null;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

function toLinkedRef(
  row: LinkedRefRow,
  currentUserId: string | null,
): LinkedAgentRef {
  return {
    id: row.id,
    agentType: row.agent_type,
    name: row.name,
    sourceAgentId: row.source_agent_id,
    sourceSnapshotAt: row.source_snapshot_at,
    updatedAt: row.updated_at,
    isOwnedByMe: !!currentUserId && row.created_by === currentUserId,
    deletedAt: row.deleted_at,
  };
}

/**
 * Resolves the linkage around an agent: what it was copied from (`source`) and
 * what was copied from it (`derived`). RLS limits `derived` to rows the caller
 * can see — so from a system agent this surfaces the caller's own personal
 * copies (plus the original maintainer agent if visible), never other users'
 * private copies. Returns data only; nothing is written to the slice.
 *
 * Soft-deleted `source`/`derived` rows are excluded here, exactly as
 * `fetchAgentSyncComparison` excludes them (`deleted_at` is NOT RLS-filtered on
 * this table). The two reads MUST agree: if the pair card resolved a twin the
 * comparison cannot read, the panel would show a live-looking agent, report
 * `unknown`, and leave Pull/Push enabled against a deleted target.
 *
 * `self` is the one deliberate exception — read UNFILTERED and carrying its
 * `deletedAt`. Filtering it would collapse "this agent is deleted" into "this
 * agent isn't linked to a system agent", which is a different and false
 * statement. The panel reads the stamp and says which one is true.
 */
export const fetchLinkedCounterpart = createAsyncThunk<
  LinkedCounterpartResult | null,
  string,
  ThunkApi
>("agentDefinition/fetchLinkedCounterpart", async (agentId, { getState }) => {
  const uid = selectUserId(getState());

  const { data: selfRow, error: selfErr } = await supabase
    .schema("agent")
    .from("definition")
    .select(LINKED_REF_COLS)
    .eq("id", agentId)
    .maybeSingle<LinkedRefRow>();
  if (selfErr) throw pgErrorToError(selfErr);
  if (!selfRow) return null;

  let source: LinkedAgentRef | null = null;
  if (selfRow.source_agent_id) {
    const { data: srcRow, error: srcErr } = await supabase
      .schema("agent")
      .from("definition")
      .select(LINKED_REF_COLS)
      .eq("id", selfRow.source_agent_id)
      .is("deleted_at", null)
      .maybeSingle<LinkedRefRow>();
    if (srcErr) throw pgErrorToError(srcErr);
    if (srcRow) source = toLinkedRef(srcRow, uid);
  }

  // archived-items-law-exempt: linked-reference GRAPH edges, not a browsable
  // list — a derived copy that has been archived is not a live link back to
  // this agent, and offering to "reveal" dead edges would misdescribe the
  // relationship. Recorded in ../common-docs/projects/archived-items-law/STATUS.md (F7).
  const { data: derivedRows, error: derErr } = await supabase
    .schema("agent")
    .from("definition")
    .select(LINKED_REF_COLS)
    .eq("source_agent_id", agentId)
    .eq("is_archived", false)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .returns<LinkedRefRow[]>();
  if (derErr) throw pgErrorToError(derErr);

  return {
    self: toLinkedRef(selfRow, uid),
    source,
    derived: (derivedRows ?? []).map((r) => toLinkedRef(r, uid)),
  };
});

export interface SyncLinkedAgentsArgs {
  /** The agent whose config is the source of truth for this sync. */
  fromId: string;
  /** The agent being overwritten. */
  toId: string;
  /**
   * When true (push/publish), the target also takes the source's
   * name/description/category/tags. When false (pull into a personal copy),
   * those identity fields are preserved. Defaults to true.
   */
  includeIdentity?: boolean;
  /** Saved source timestamp shown in the comparison the user reviewed. */
  expectedFromUpdatedAt: string;
  /** Saved target timestamp shown in the comparison the user reviewed. */
  expectedToUpdatedAt: string;
}

/**
 * Copies the canonical config from one agent of a linked pair to the other via
 * `agx_sync_linked_agents`. Powers both Push (user → system, super-admin) and
 * Pull (system → my copy, owner). The DB enforces linkage + write gating and
 * rejects either record changing after the comparison was reviewed. Returns
 * the target id without hydrating Redux, so an open Builder draft is untouched.
 */
export const syncLinkedAgents = createAsyncThunk<
  string,
  SyncLinkedAgentsArgs,
  ThunkApi
>(
  "agentDefinition/syncLinked",
  async ({
    fromId,
    toId,
    includeIdentity = true,
    expectedFromUpdatedAt,
    expectedToUpdatedAt,
  }) => {
    const { data, error } = await supabase.rpc(
      "agx_sync_linked_agents_reviewed",
      {
        p_from_id: fromId,
        p_to_id: toId,
        p_include_identity: includeIdentity,
        p_expected_from_updated_at: expectedFromUpdatedAt,
        p_expected_to_updated_at: expectedToUpdatedAt,
      },
    );
    if (error) throw pgErrorToError(error);

    const targetId = data as string;
    return targetId;
  },
);

export interface AgentSyncComparisonArgs {
  /** The user-side agent of the linked pair. */
  userAgentId: string;
  /** The system ("builtin") agent of the linked pair. */
  systemAgentId: string;
}

/**
 * Reads both sides of a linked pair and answers whether they are actually the
 * same — the question the sync panel exists to answer.
 *
 * Reads EXACTLY the columns `agx_sync_linked_agents` copies
 * (`AGENT_SYNC_SNAPSHOT_SELECT`), raw, so the verdict can never disagree with
 * what Pull/Push would write. A side RLS hides (or that no longer exists) comes
 * back as no row, which the comparison reports as `unknown` — never as
 * "identical".
 *
 * Returns data only; nothing is written to the slice.
 */
export const fetchAgentSyncComparison = createAsyncThunk<
  AgentSyncComparison,
  AgentSyncComparisonArgs,
  ThunkApi
>(
  "agentDefinition/fetchSyncComparison",
  async ({ userAgentId, systemAgentId }) => {
    // `deleted_at` is NOT filtered by RLS on this table, so a soft-deleted
    // side would otherwise be compared and offered as a live sync target.
    // Excluding it here makes that side unreadable, which surfaces as
    // `unknown` — the honest answer.
    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .select(AGENT_SYNC_SNAPSHOT_SELECT)
      .in("id", [userAgentId, systemAgentId])
      .is("deleted_at", null)
      .returns<Record<string, unknown>[]>();
    if (error) throw pgErrorToError(error);

    const byId = new Map<string, Record<string, unknown>>();
    for (const row of data ?? []) {
      if (typeof row.id === "string") byId.set(row.id, row);
    }

    const userRow = byId.get(userAgentId);
    const systemRow = byId.get(systemAgentId);

    return compareAgentSyncSnapshots(
      userRow ? toAgentSyncSnapshot(userRow) : null,
      systemRow ? toAgentSyncSnapshot(systemRow) : null,
    );
  },
);

/**
 * Creates a personal (user-owned) copy of a system agent, linked back to it via
 * `source_agent_id`. Idempotent: if the current user already has a non-archived
 * personal copy of this system agent, that copy is returned instead of creating
 * another — so the action doubles as "open my copy". The created/found copy is
 * loaded into state.
 */
export const createPersonalCopy = createAsyncThunk<
  PersonalCopyResult,
  string,
  ThunkApi
>(
  "agentDefinition/createPersonalCopy",
  async (systemAgentId, { dispatch, getState }) => {
    const uid = selectUserId(getState());

    if (uid) {
      const { data: existing, error: existErr } = await supabase
        .schema("agent")
        .from("definition")
        .select("id")
        .eq("source_agent_id", systemAgentId)
        .eq("created_by", uid)
        .eq("agent_type", "user")
        .eq("is_archived", false)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (existErr) throw pgErrorToError(existErr);

      if (existing) {
        await dispatch(fetchFullAgent(existing.id));
        return { agentId: existing.id, alreadyExisted: true };
      }
    }

    const newId = await dispatch(
      duplicateAgent({ agentId: systemAgentId, asSystem: false }),
    ).unwrap();
    return { agentId: newId, alreadyExisted: false };
  },
);
