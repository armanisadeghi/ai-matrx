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
 *   fetchAgentRunTier            — TIER 2: what a run needs, never the definition (skips if ready)
 *   fetchAgentExecutionMinimal   — the run tier under its pre-P24 name (app callers)
 *   fetchAgentRunControls        — what the run-control pickers show (P25)
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

import {
  agentNotReadableError,
} from "./agent-not-readable";
import {
  createAsyncThunk,
} from "@reduxjs/toolkit";
import {
  hasField,
} from "@ai-matrx/agents/field-flags";
import {
  supabase,
} from "../../../host/db";
import {
  tryWriteOne,
  writeOneRow,
} from "@ai-matrx/data/db";
import type {
  AgentSummary,
} from "@ai-matrx/agents/catalog";
import { getAgentCatalog } from "@ai-matrx/chat/host/ui-slots";
import {
  runWithSessionRetry,
} from "../../../host/session-retry";
import {
  pgErrorToError,
} from "@ai-matrx/data";
import {
  agentNameTakenError,
} from "./agentNameTaken";
import {
  withRetry,
} from "@ai-matrx/data/net";
import {
  ConnectTimeoutError,
} from "@ai-matrx/data/net";
import type {
  ChatDispatch,
  ChatRootState,
} from "../../../store/root-state";
import type {
  Database,
} from "../../../host/db-types";
import type {
  DbRpcRow,
} from "@ai-matrx/chat/ui/supabase-rpc";
import {
  type AIModelRecord,
} from "../../model-registry/modelRegistrySlice";
import type {
  AgentDefinition,
  AgentRunTier,
  AgentVersionLookup,
} from "../../types/agent-definition.types";
import {
  isSyntheticAgentId,
} from "./synthetic-id";
import {
  readFavoriteIds,
  writeFavorite,
} from "../../../context/sources/scopes";
import {
  parseAgentVersionSnapshot,
} from "./parse-output-snapshot";
import {
  assignField,
} from "@ai-matrx/agents/field-flags";
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
  selectAgentReadyForExecution,
  selectAgentRunControlsReady,
} from "./selectors";
import {
  dbRowToAgentDefinition,
  agentDefinitionToInsert,
  agentDefinitionToUpdate,
  versionSnapshotRowToAgentDefinition,
  parseSkillConfigJson,
} from "./converters";
import {
  selectUserId,
  isSignedOutVisitor,
  NotAuthenticatedError,
} from "../../../host/identity";
import {
  selectOrganizationId,
  ensureOrgId,
} from "../../../host/org";

type ThunkApi = { dispatch: ChatDispatch; state: ChatRootState };

export type AgentToolAssignmentRow = Pick<
  Database["agent"]["Tables"]["definition"]["Row"],
  | "id"
  | "created_by"
  | "organization_id"
  | "version"
  | "tools"
  | "model_id"
  | "is_archived"
>;

export class AgentToolAssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolAssignmentError";
  }
}

export class AgentToolAssignmentConflictError extends AgentToolAssignmentError {
  constructor() {
    super(
      "This agent's tools, owner, or model changed while you were editing. Refresh the agent and retry your tool change.",
    );
    this.name = "AgentToolAssignmentConflictError";
  }
}

export function uniqueToolIds(ids: readonly string[], label: string): string[] {
  const unique = new Set<string>();
  for (const id of ids) {
    if (!id.trim()) {
      throw new AgentToolAssignmentError(
        `${label} tool IDs must not be empty.`,
      );
    }
    unique.add(id);
  }
  return [...unique];
}

export function assertOwnedLiveAgentToolAssignment(
  row: AgentToolAssignmentRow,
  userId: string,
): void {
  // The agent's OWN organization decides nothing here: an owner can change the tools of their
  // agent wherever it lives, whichever organization is active (law: the active organization is
  // never a filter — common-docs/policies/access-ladder.md).
  if (row.created_by !== userId) {
    throw new AgentToolAssignmentError("Only the agent owner can change its tools.");
  }
  if (row.is_archived) {
    throw new AgentToolAssignmentError(
      "Restore this archived agent before changing its tools.",
    );
  }
}

export function assertRegisteredActiveToolAdditions(
  requestedIds: readonly string[],
  activeIds: ReadonlySet<string>,
): void {
  const invalidId = requestedIds.find((id) => !activeIds.has(id));
  if (invalidId) {
    throw new AgentToolAssignmentError(
      `Tool ${invalidId} is unavailable or inactive. Refresh the tool catalogue and retry.`,
    );
  }
}

export function assertToolAdditionModelCapability(
  addToolIds: readonly string[],
  modelId: string | null,
  modelAvailable: boolean,
  modelSupportsTools: boolean,
): void {
  if (addToolIds.length === 0) return;
  if (!modelId) {
    throw new AgentToolAssignmentError(
      "Choose a tool-capable model before adding tools to this agent.",
    );
  }
  if (!modelAvailable) {
    throw new AgentToolAssignmentError(
      "This agent's model is not available. Refresh the model catalogue and retry.",
    );
  }
  if (!modelSupportsTools) {
    throw new AgentToolAssignmentError(
      "This agent's model does not support tools. Choose a tool-capable model before adding tools.",
    );
  }
}

/** A tool addition needs a full, active catalog record; an options-only or retired row cannot prove its controls. */
export function isAvailableToolModel(
  model: AIModelRecord | undefined,
): model is AIModelRecord {
  return (
    model !== undefined &&
    model._fetchType === "full" &&
    model.is_deprecated !== true &&
    model.deleted_at === null &&
    model.retired_at === null
  );
}

/** Pure delta application so retries always derive from the fresh row, never a stale full array. */
export function applyAgentToolDelta(
  currentTools: readonly string[],
  addToolIds: readonly string[],
  removeToolIds: readonly string[],
): string[] {
  const remove = new Set(removeToolIds);
  const next = currentTools.filter((id) => !remove.has(id));
  const seen = new Set(next);
  for (const id of addToolIds) {
    if (!seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }
  return next;
}

export function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function isToolAssignmentPhantom(
  current: AgentToolAssignmentRow,
  base: AgentToolAssignmentRow,
): boolean {
  return (
    sameStringArray(current.tools, base.tools) &&
    current.model_id === base.model_id &&
    current.created_by === base.created_by &&
    current.organization_id === base.organization_id &&
    current.is_archived === base.is_archived
  );
}

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

function toRegistryAccessLevel(
  value: string | null,
): RegistryAccessLevel | null {
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
  dispatch: ChatDispatch,
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
        // No `isFavorite`: the catalog row's column is retired — stars are
        // overlaid from platform.user_entity_state by `overlayAgentFavorites`.
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
        // The class pin; a catalog read that lacks the column leaves it absent.
        ...(row.offeringId === undefined ? {} : { listOfferingPin: row.offeringId }),
      }),
    );
    dispatch(setAgentFetchStatus({ id: row.id, status: "list" }));
  }
}


/**
 * Overlay the caller's stars from platform.user_entity_state onto the agents
 * just loaded — ONE `ues_get_bulk` for the whole set. Every listed id is set
 * (true iff starred). A failed read logs and leaves the stars as they were.
 */
async function overlayAgentFavorites(
  dispatch: ChatDispatch,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const favorites = await readFavoriteIds("agent", ids);
  if (!favorites) return;
  for (const id of ids) {
    dispatch(mergePartialAgent({ id, isFavorite: favorites.has(id) }));
  }
}

/** Thunk form of `overlayAgentFavorites`, for surfaces that seed rows themselves. */
export const overlayAgentFavoritesThunk = createAsyncThunk<
  void,
  readonly string[],
  ThunkApi
>("agentDefinition/overlayFavorites", async (ids, { dispatch }) => {
  await overlayAgentFavorites(dispatch, ids);
});

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
    dispatch(setAgentsError(null));
    const catalog = getAgentCatalog();
    try {
      await catalog.ensureLoaded();
    } catch (e) {
      dispatch(setAgentsError(e instanceof Error ? e.message : String(e)));
      dispatch(setAgentsStatus("failed"));
      throw e;
    }
    const rows = catalog.getState().rows;
    mergeAgentSummaries(dispatch, rows);
    await overlayAgentFavorites(
      dispatch,
      rows.map((r) => r.id),
    );
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
    const hits = ids
      .map((id) => state.byId[id])
      .filter((r): r is AgentSummary => !!r);
    mergeAgentSummaries(dispatch, hits);
    await overlayAgentFavorites(
      dispatch,
      hits.map((r) => r.id),
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
    const rows = catalog.getState().rows;
    mergeAgentSummaries(dispatch, rows);
    await overlayAgentFavorites(
      dispatch,
      rows.map((r) => r.id),
    );
  },
);

/**
 * Makes sure ONE agent's identity (name, description, …) is in this registry.
 *
 * Neither execution fetch (`agx_get_execution_minimal` / `_full`) carries the
 * name, so an agent that no list fetch had loaded launched with a nameless
 * record: every window titled it "Agent" and the empty hero lost its name.
 * The name comes from the same place every name comes from — the ONE catalog —
 * projected through `mergeAgentSummaries`. No-op when the name is present.
 */
export const ensureAgentIdentity = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/ensureIdentity",
  async (agentId, { dispatch, getState }) => {
    if (getState().agentDefinition.agents?.[agentId]?.name) return;
    const catalog = getAgentCatalog();
    let row = catalog.getState().byId[agentId];
    if (!row) {
      await catalog.ensureLoaded();
      row = catalog.getState().byId[agentId];
    }
    if (row) {
      mergeAgentSummaries(dispatch, [row]);
      await overlayAgentFavorites(dispatch, [row.id]);
    }
  },
);

/**
 * TIER 2 — THE RUN TIER (PACKAGE-INDEPENDENCE §3, P24). Everything a run needs
 * and nothing it does not: variables, context rules, the kill switch, the
 * default model (override-diff base + display), input gates, tool ids
 * (display), name and access level — from ONE read, `agx_get_run_tier`.
 *
 * A run NEVER fetches the definition (settings, messages, custom tool bodies,
 * output schema). The server loads the agent itself and owns the merge of
 * `config_overrides`, including cross-provider conversion (P23, verified live
 * 2026-10-05). `pnpm check:agent-run-tier` keeps the definition fetches out of
 * the run path.
 *
 * Skips the network call once the record reached `"execution"` status.
 */
export const fetchAgentRunTier = createAsyncThunk<
  void,
  string | { agentId: string; force: true },
  ThunkApi
>(
  "agentDefinition/fetchRunTier",
  async (arg, { dispatch, getState }) => {
    const agentId = typeof arg === "string" ? arg : arg.agentId;
    const force = typeof arg !== "string" && arg.force;
    // Readiness is the FETCH STATUS the thunks set, never field presence: a
    // record from the list fetch can carry `contextPolicies: []` and
    // `autoContextDisabled: false` it never read, and skipping here left a
    // kill-switch agent's context layer unknown on every send. The run tier
    // must ALSO have carried the model — a record marked "execution" by an
    // older payload without it is refetched once.
    const existing = getState().agentDefinition.agents?.[agentId];
    if (
      !force &&
      selectAgentReadyForExecution(getState(), agentId) &&
      existing &&
      hasField(existing._loadedFields, "modelId")
    )
      return;
    // Signed out: the RPC refuses `anon` ("permission denied for function").
    // Not authenticated is a state the caller renders, never a fetch failure.
    if (await isSignedOutVisitor()) throw new NotAuthenticatedError();

    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await withRetry(
      () =>
        new Promise<
          Awaited<ReturnType<typeof supabase.rpc<"agx_get_run_tier">>>
        >((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new ConnectTimeoutError(15_000));
          }, 15_000);
          supabase.rpc("agx_get_run_tier", { p_agent_id: agentId }).then(
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
      throw agentNameTakenError(error) ?? pgErrorToError(error);
    }

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) {
      // NO ROW IS A REFUSAL, never a quiet success. The RPC answers `[]` when
      // the caller cannot read the agent (another organization's agent behind
      // a shared app). Returning here left `isReady` false forever with no
      // error, so every Run on /agent-apps/[id]/run "was still loading"
      // (page-pass 2026-09-27) and callers never reached their fallback door.
      const refusal = agentNotReadableError(agentId);
      dispatch(setAgentError({ id: agentId, error: refusal.message }));
      throw refusal;
    }
    const row = raw as unknown as AgentRunTier;

    dispatch(
      mergePartialAgent({
        id: row.id,
        variableDefinitions: row.variable_definitions,
        contextPolicies: row.context_policies ?? [],
        // Without it every run-tier record read "injection allowed" even for
        // an agent that refuses ad-hoc context.
        autoContextDisabled: row.auto_context_disabled === true,
        ...(row.model_id ? { modelId: row.model_id } : {}),
        uiGates: row.ui_gates ?? {},
        ...(row.tool_ids ? { tools: row.tool_ids } : {}),
        ...(existing?.name ? {} : { name: row.name }),
        ...(existing?.description != null
          ? {}
          : { description: row.description ?? "" }),
        ...(existing?.accessLevel
          ? {}
          : { accessLevel: toRegistryAccessLevel(row.access_level) }),
        runCounts: {
          customTools: row.custom_tool_count ?? 0,
          skills: row.skill_count ?? 0,
          connections: row.connection_count ?? 0,
        },
      }),
    );
    dispatch(setAgentFetchStatus({ id: row.id, status: "execution" }));
  },
);

/**
 * The run tier under its pre-P24 name, kept because ~30 app call sites
 * (outside the package) still ask for "minimal execution". Same thunk, same
 * read — `agx_get_execution_minimal` is no longer called by anyone here.
 */
export const fetchAgentExecutionMinimal = fetchAgentRunTier;

/**
 * RUN CONTROLS (P25). What the run-control pickers (Quickset, Tools, Skills,
 * Connections) show about the agent — tool ids, custom tool NAMES, the
 * auto-tools switch, skill config and connections — from ONE small read,
 * `agx_get_run_controls`. Never the definition: the pickers used to fetch
 * `agx_get_execution_full` (settings + custom tool bodies), which is
 * builder-tier. Fetched only when a picker opens. A value the record already
 * holds (the builder loaded it, or a person is editing it) is never replaced.
 */
export const fetchAgentRunControls = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/fetchRunControls",
  async (agentId, { dispatch, getState }) => {
    if (selectAgentRunControlsReady(getState(), agentId)) return;
    if (await isSignedOutVisitor()) throw new NotAuthenticatedError();

    const { data, error } = await supabase.rpc("agx_get_run_controls", {
      p_agent_id: agentId,
    });

    if (error) {
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw pgErrorToError(error);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      const refusal = agentNotReadableError(agentId);
      dispatch(setAgentError({ id: agentId, error: refusal.message }));
      throw refusal;
    }

    const loaded = getState().agentDefinition.agents?.[agentId]?._loadedFields;
    const missing = (field: keyof AgentDefinition) =>
      !loaded || !hasField(loaded, field);
    dispatch(
      mergePartialAgent({
        id: row.id,
        runControls: { customToolNames: row.custom_tool_names ?? [] },
        ...(missing("tools") ? { tools: row.tool_ids ?? [] } : {}),
        ...(missing("autoToolsDisabled")
          ? { autoToolsDisabled: row.auto_tools_disabled === true }
          : {}),
        ...(missing("skillConfig")
          ? { skillConfig: parseSkillConfigJson(row.skill_config) }
          : {}),
        ...(missing("mcpServers") ? { mcpServers: row.mcp_servers ?? [] } : {}),
      }),
    );
  },
);

// `fetchAgentExecutionFull` (agx_get_execution_full) is builder-tier and lives
// in the app since P25: features/agents/redux/builder-tier.thunks.ts — with
// applyOwnedAgentToolDelta, setAgentAutoToolsDisabled/AutoContextDisabled,
// resetAgentToSource, promoteAgentVersion,
// updateAgentFromSource and the linked-agent sync thunks.

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
      throw agentNameTakenError(error) ?? pgErrorToError(error);
    }

    dispatch(upsertAgent(dbRowToAgentDefinition(data)));
    await overlayAgentFavorites(dispatch, [agentId]);
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
  // Per-person stars: a shared agent can be starred by the person it is
  // shared with — the column on the owner's row could never say that.
  await overlayAgentFavorites(
    dispatch,
    rows.map((r) => r.id),
  );

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
>("agentDefinition/initializeChatAgents", async (arg, { dispatch }) => {
  const force = (arg as { force?: boolean } | undefined)?.force ?? false;
  const catalog = getAgentCatalog();
  await catalog.ensureLoaded(force ? { force: true } : undefined);
  mergeAgentSummaries(dispatch, catalog.getState().rows);
});

