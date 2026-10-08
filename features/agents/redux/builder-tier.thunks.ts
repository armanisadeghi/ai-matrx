/**
 * BUILDER TIER (PACKAGE-INDEPENDENCE §3, chat-package P25) — reads of the
 * agent DEFINITION that only the builder and admin/configuration surfaces
 * need. They left `@ai-matrx/chat` at P25: chat runs read the run tier
 * (`fetchAgentRunTier`) and the run-control pickers read
 * `fetchAgentRunControls`; nothing in the package fetches the definition
 * except voice until P24v.
 *
 * The thunk still writes the package's `agentDefinition` slice (same action
 * type as before), so every selector reads what it loads unchanged.
 */

import { withAdminFeature } from "@/utils/auth/adminFeaturesOnUserPages";
import {
  createAsyncThunk,
} from "@reduxjs/toolkit";
import {
  pgErrorToError,
} from "@ai-matrx/data";
import {
  supabase,
} from "@ai-matrx/chat/host/db";
import {
  isSignedOutVisitor,
  NotAuthenticatedError,
  selectUserId,
} from "@ai-matrx/chat/host/identity";
import type {
  ChatDispatch,
  ChatRootState,
} from "@ai-matrx/chat/store/root-state";
import type {
  AgentExecutionFull,
  UpdateFromSourceResult,
  PromoteVersionResult,
  LinkedAgentRef,
  LinkedCounterpartResult,
  LostLinkedSource,
  PersonalCopyResult,
} from "@ai-matrx/chat/agents/types/agent-definition.types";
import {
  selectAgentCustomExecutionPayload,
  selectAgentById,
} from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  mergePartialAgent,
  setAgentError,
  setAgentFetchStatus,
  setAgentLoading,
} from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import {
  agentNameTakenError,
} from "@ai-matrx/chat/agents/redux/agent-definition/agentNameTaken";
import {
  guardedUpdate,
  writeOneRow,
} from "@ai-matrx/data/db";
import type {
  Database,
} from "@ai-matrx/chat/host/db-types";
import { selectModelById } from "@ai-matrx/agents/models";
import { readModelRecords } from "@ai-matrx/chat/agents/identity/model-catalog";
import {
  resolveModelControls,
  supportsTools,
} from "@ai-matrx/chat/agents/hooks/useModelControls";
import {
  compareAgentSyncSnapshots,
  type AgentSyncComparison,
} from "@/features/agents/sync/compare";
import {
  AGENT_SYNC_SNAPSHOT_SELECT,
  toAgentSyncSnapshot,
} from "@/features/agents/sync/sync-fields";
import {
  isSyntheticAgentId,
} from "@ai-matrx/chat/agents/redux/agent-definition/synthetic-id";
import {
  AgentToolAssignmentConflictError,
  AgentToolAssignmentError,
  type AgentToolAssignmentRow,
  applyAgentToolDelta,
  assertOwnedLiveAgentToolAssignment,
  assertRegisteredActiveToolAdditions,
  assertToolAdditionModelCapability,
  isAvailableToolModel,
  isToolAssignmentPhantom,
  sameStringArray,
  uniqueToolIds,
} from "@ai-matrx/chat/agents/redux/agent-definition/thunks";
import { duplicateAgent, saveAgentField } from "./builder-write.thunks";
import { fetchFullAgent } from "./fetch-full-agent.thunk";
import { fetchUserDisplayNames } from "@/features/mandates/notes";

import {
  markAgentSaved,
} from "@/features/agents/redux/agent-builder.slice";
type ThunkApi = { dispatch: ChatDispatch; state: ChatRootState };

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
    // Signed out: the RPC refuses `anon` — a state, never a fetch failure.
    if (await isSignedOutVisitor()) throw new NotAuthenticatedError();

    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await supabase.rpc("agx_get_execution_full", {
      p_agent_id: agentId,
    });

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw agentNameTakenError(error) ?? pgErrorToError(error);
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
        autoContextDisabled: row.auto_context_disabled === true,
      }),
    );
    dispatch(setAgentFetchStatus({ id: row.id, status: "customExecution" }));
  },
);

/**
 * Applies an additive/removal tool assignment to an owned live agent.
 *
 * This deliberately does not use `saveAgentField`: a tool picker has a delta,
 * not authority to replay whichever complete array happened to be in Redux.
 * Every attempt starts from a fresh RLS-visible row, and a CAS retry recomputes
 * the delta from the row that actually won the race.
 */
export const applyOwnedAgentToolDelta = createAsyncThunk<
  { tools: string[]; version: number; rebased: boolean; unchanged: boolean },
  {
    agentId: string;
    addToolIds?: readonly string[];
    removeToolIds?: readonly string[];
  },
  ThunkApi
>(
  "agentDefinition/applyOwnedToolDelta",
  async (
    { agentId, addToolIds = [], removeToolIds = [] },
    { dispatch, getState },
  ) => {
    if (isSyntheticAgentId(agentId)) {
      throw new AgentToolAssignmentError(
        "Tool assignments cannot be saved on a synthetic agent.",
      );
    }

    const local = selectAgentById(getState(), agentId);
    if (local?.isVersion) {
      throw new AgentToolAssignmentError(
        "Tool assignments cannot be saved on an agent version snapshot.",
      );
    }

    const userId = selectUserId(getState());
    if (!userId)
      throw new AgentToolAssignmentError(
        "Sign in again before changing this agent's tools.",
      );
    const add = uniqueToolIds(addToolIds, "Added");
    const remove = uniqueToolIds(removeToolIds, "Removed");
    const overlap = add.find((id) => remove.includes(id));
    if (overlap) {
      throw new AgentToolAssignmentError(
        `Tool ${overlap} cannot be added and removed in the same change.`,
      );
    }

    const { data: base, error: readError } = await supabase
      .schema("agent")
      .from("definition")
      .select(
        "id, created_by, organization_id, version, tools, model_id, is_archived",
      )
      .eq("id", agentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (readError) throw pgErrorToError(readError);
    if (!base) {
      throw new AgentToolAssignmentError(
        "This agent is unavailable. Refresh the page and try again.",
      );
    }
    assertOwnedLiveAgentToolAssignment(base, userId);

    // Only additions need to be active today. Removal must also be able to
    // clean up a historical inactive reference already on the agent.
    if (add.length > 0) {
      const { data: activeTools, error: toolsError } = await supabase
        .schema("tool")
        .from("definition")
        .select("id")
        .is("deleted_at", null)
        .in("id", add)
        .eq("is_active", true);
      if (toolsError) throw pgErrorToError(toolsError);
      const activeIds = new Set((activeTools ?? []).map((tool) => tool.id));
      assertRegisteredActiveToolAdditions(add, activeIds);
    }

    if (add.length > 0) {
      const selectedModel = base.model_id
        ? selectModelById(readModelRecords(), base.model_id)
        : undefined;
      const model = isAvailableToolModel(selectedModel)
        ? selectedModel
        : undefined;
      const { normalizedControls } =
        model && base.model_id
          ? resolveModelControls([model], base.model_id)
          : { normalizedControls: null };
      assertToolAdditionModelCapability(
        add,
        base.model_id,
        model !== undefined,
        supportsTools(normalizedControls),
      );
    }

    const desiredTools = applyAgentToolDelta(base.tools, add, remove);
    if (sameStringArray(desiredTools, base.tools)) {
      dispatch(
        mergePartialAgent({
          id: agentId,
          tools: base.tools,
          version: base.version,
        }),
      );
      return {
        tools: base.tools,
        version: base.version,
        rebased: false,
        unchanged: true,
      };
    }

    // `guardedUpdate` invokes `isPhantom` immediately before a retry. Keep the
    // write base mutable so the retry derives the delta from that freshly read
    // row rather than replaying a captured complete array.
    let writeBase = base;
    const result = await guardedUpdate<AgentToolAssignmentRow>({
      expectedVersion: base.version,
      applyUpdate: ({ expectedVersion, nextVersion }) =>
        supabase
          .schema("agent")
          .from("definition")
          .update({
            tools: applyAgentToolDelta(writeBase.tools, add, remove),
            version: nextVersion,
          })
          .eq("id", agentId)
          .eq("created_by", userId)
          .eq("organization_id", writeBase.organization_id) // the record's own organization
          .eq("version", expectedVersion)
          .is("deleted_at", null)
          .eq("is_archived", false)
          .select(
            "id, created_by, organization_id, version, tools, model_id, is_archived",
          )
          .maybeSingle(),
      fetchCurrent: () =>
        supabase
          .schema("agent")
          .from("definition")
          .select(
            "id, created_by, organization_id, version, tools, model_id, is_archived",
          )
          .eq("id", agentId)
          .is("deleted_at", null)
          .maybeSingle(),
      rebase: {
        isPhantom: (current) => {
          if (!isToolAssignmentPhantom(current, base)) return false;
          writeBase = current;
          return true;
        },
      },
    });

    if (result.status === "not_found") {
      throw new AgentToolAssignmentError(
        "This agent is no longer available. Refresh the page and try again.",
      );
    }
    if (result.status === "conflict") {
      throw new AgentToolAssignmentConflictError();
    }

    // Merge only the durable receipt. Do not call markAgentSaved: fields the
    // builder is editing independently must stay dirty.
    dispatch(
      mergePartialAgent({
        id: agentId,
        tools: result.row.tools,
        version: result.row.version,
      }),
    );
    return {
      tools: result.row.tools,
      version: result.row.version,
      rebased: result.rebasedFrom !== undefined,
      unchanged: false,
    };
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

    const { data, error } = await writeOneRow(
      supabase
        .schema("agent")
        .from("definition")
        .update({
          tool_config: {
            ...existingConfig,
            auto_tools_disabled: disabled,
          } as Database["agent"]["Tables"]["definition"]["Update"]["tool_config"],
        })
        .eq("id", agentId)
        .select("version, updated_at, follows_source"),
      { action: "update", noun: "definition" },
    );

    if (error) {
      dispatch(mergePartialAgent({ id: agentId, autoToolsDisabled: previous }));
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw agentNameTakenError(error) ?? pgErrorToError(error);
    }

    if (data) {
      dispatch(
        mergePartialAgent({
          id: agentId,
          version: data.version,
          updatedAt: data.updated_at,
          // An edit to what a following copy follows turns it off in the database.
          followsSource: data.follows_source,
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

    const { data, error } = await writeOneRow(
      supabase
        .schema("agent")
        .from("definition")
        .update({ auto_context_disabled: disabled })
        .eq("id", agentId)
        .select("version, updated_at, follows_source"),
      { action: "update", noun: "definition" },
    );

    if (error) {
      dispatch(
        mergePartialAgent({ id: agentId, autoContextDisabled: previous }),
      );
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw agentNameTakenError(error) ?? pgErrorToError(error);
    }

    if (data) {
      dispatch(
        mergePartialAgent({
          id: agentId,
          version: data.version,
          updatedAt: data.updated_at,
          // An edit to what a following copy follows turns it off in the database.
          followsSource: data.follows_source,
        }),
      );
    }
  },
);
/**
 * "Reset to latest": puts the source agent's current instructions, tools, model and
 * settings back on a copy and turns following on again (`agx_reset_agent_to_source`,
 * run as the person — row security decides). The copy's own variable bindings stay.
 */
export const resetAgentToSource = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/resetToSource",
  async (agentId, { dispatch }) => {
    const { error } = await supabase.rpc("agx_reset_agent_to_source", {
      p_agent_id: agentId,
    });
    if (error) throw pgErrorToError(error);
    await dispatch(fetchFullAgent(agentId));
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
  "id, agent_type, name, source_agent_id, source_snapshot_at, updated_at, created_by, deleted_at, is_archived, organization_id, visibility";

interface LinkedRefRow {
  id: string;
  agent_type: "user" | "builtin";
  name: string;
  source_agent_id: string | null;
  source_snapshot_at: string | null;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
  is_archived: boolean | null;
  organization_id: string | null;
  visibility: string | null;
}

/** Levels at which the builder's own save is allowed (agent.definition std_update). */
const EDIT_LEVELS = new Set(["owner", "admin", "editor"]);

/**
 * The viewer's level on each agent, from the existing door `agx_get_access_level`
 * (owner/admin/editor/viewer/public/none). Owned rows and system rows need no call.
 */
async function fetchAccessLevels(
  rows: LinkedRefRow[],
  uid: string | null,
): Promise<Map<string, string>> {
  const levels = new Map<string, string>();
  const ask: string[] = [];
  for (const row of rows) {
    if (row.agent_type === "builtin") levels.set(row.id, "viewer");
    else if (uid && row.created_by === uid) levels.set(row.id, "owner");
    else ask.push(row.id);
  }
  await Promise.all(
    ask.map(async (id) => {
      const { data, error } = await supabase.rpc("agx_get_access_level", {
        p_agent_id: id,
      });
      if (error) throw pgErrorToError(error);
      levels.set(id, data?.[0]?.access_level ?? "none");
    }),
  );
  return levels;
}

/**
 * Owner words for each agent, through reads the viewer already has: person
 * display names from `users.profiles`, then the access-gate door
 * (`access_denied_context`) for an owner whose profile is not readable; organization names from
 * `iam.organizations` (both row-security limited — an unreadable name stays
 * null and the panel says "Someone else").
 */
async function fetchOwnerNames(
  rows: LinkedRefRow[],
  uid: string | null,
): Promise<{ people: Map<string, string>; orgs: Map<string, string> }> {
  const others = rows.filter(
    (r) => r.agent_type !== "builtin" && r.created_by && r.created_by !== uid,
  );
  const personIds = [...new Set(others.map((r) => r.created_by as string))];
  const orgIds = [
    ...new Set(
      others
        .filter((r) => r.organization_id && r.visibility !== "personal")
        .map((r) => r.organization_id as string),
    ),
  ];
  const [people, orgs] = await Promise.all([
    (async () => {
      // Profiles first; a person whose profile row the viewer cannot read
      // (a friend who shared an agent) is named by the access-gate door,
      // which names a record's owner to anyone who can see the record.
      const names = await fetchUserDisplayNames(personIds);
      const missing = others.filter((r) => !names.has(r.created_by as string));
      const seen = new Set<string>();
      await Promise.all(
        missing
          .filter((r) => {
            const owner = r.created_by as string;
            if (seen.has(owner)) return false;
            seen.add(owner);
            return true;
          })
          .map(async (r) => {
            const { data } = await supabase.rpc("access_denied_context", {
              p_type: "agent",
              p_id: r.id,
            });
            const owner = (data as { owner?: { user_id?: string; display_name?: string | null } } | null)?.owner;
            const label = owner?.display_name?.trim();
            if (owner?.user_id && label) names.set(owner.user_id, label);
          }),
      );
      return names;
    })(),
    (async () => {
      const names = new Map<string, string>();
      if (orgIds.length === 0) return names;
      const { data } = await supabase
        .schema("iam")
        .from("organizations")
        .select("id, name")
        .in("id", orgIds);
      for (const row of data ?? []) {
        if (row.name?.trim()) names.set(row.id, row.name.trim());
      }
      return names;
    })(),
  ]);
  return { people, orgs };
}

function toLinkedRef(
  row: LinkedRefRow,
  currentUserId: string | null,
  levels: Map<string, string>,
  names: { people: Map<string, string>; orgs: Map<string, string> },
): LinkedAgentRef {
  const isMine = !!currentUserId && row.created_by === currentUserId;
  const orgName =
    row.organization_id && row.visibility !== "personal"
      ? (names.orgs.get(row.organization_id) ?? null)
      : null;
  // An org-visible agent of someone else, in an organization the viewer can
  // read, belongs to that organization as far as the viewer is concerned.
  const ownerKind: LinkedAgentRef["ownerKind"] =
    row.agent_type === "builtin"
      ? "system"
      : isMine
        ? "me"
        : orgName
          ? "organization"
          : "person";
  const accessLevel = levels.get(row.id) ?? (isMine ? "owner" : "none");
  return {
    id: row.id,
    agentType: row.agent_type,
    name: row.name,
    sourceAgentId: row.source_agent_id,
    sourceSnapshotAt: row.source_snapshot_at,
    updatedAt: row.updated_at,
    isOwnedByMe: isMine,
    deletedAt: row.deleted_at,
    isArchived: row.is_archived === true,
    ownerKind,
    ownerName:
      ownerKind === "organization"
        ? orgName
        : ownerKind === "person" && row.created_by
          ? (names.people.get(row.created_by) ?? null)
          : null,
    accessLevel,
    canEdit: row.agent_type !== "builtin" && EDIT_LEVELS.has(accessLevel),
  };
}

/**
 * Resolves the linkage around an agent — what it was made from (`source`) and
 * what was copied from it (`derived`) — with the facts Linked Agent Sync names
 * things by: each agent's owner (me / a person / an organization / system) and
 * whether the viewer may edit it (the builder's own rule: owner or editor).
 * RLS limits `derived` to rows the caller can read. Returns data only.
 *
 * Soft-deleted and archived relatives are never offered as sync partners. A
 * `source` that exists by id but cannot be opened (unshared, made private,
 * archived, deleted) comes back as `lostSource`, so the panel says "Made from
 * an agent you can no longer open" instead of "not linked".
 *
 * `self` is read UNFILTERED and carries its `deletedAt`, so "this agent is
 * deleted" is never collapsed into "this agent isn't linked".
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

  let srcRow: LinkedRefRow | null = null;
  let lostSource: LostLinkedSource | null = null;
  if (selfRow.source_agent_id) {
    const { data, error: srcErr } = await supabase
      .schema("agent")
      .from("definition")
      .select(LINKED_REF_COLS)
      .eq("id", selfRow.source_agent_id)
      .maybeSingle<LinkedRefRow>();
    if (srcErr) throw pgErrorToError(srcErr);
    if (data && data.deleted_at) {
      lostSource = { id: data.id, reason: "deleted" };
    } else if (data && data.is_archived) {
      lostSource = { id: data.id, reason: "archived" };
    } else if (data) {
      srcRow = data;
    } else {
      // Not readable: the door answers whether the row still exists at all.
      const { data: lvl, error: lvlErr } = await supabase.rpc(
        "agx_get_access_level",
        { p_agent_id: selfRow.source_agent_id },
      );
      if (lvlErr) throw pgErrorToError(lvlErr);
      lostSource = {
        id: selfRow.source_agent_id,
        reason: lvl && lvl.length > 0 ? "unreadable" : "deleted",
      };
    }
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

  const allRows = [selfRow, ...(srcRow ? [srcRow] : []), ...(derivedRows ?? [])];
  const [levels, names] = await Promise.all([
    fetchAccessLevels(allRows, uid),
    fetchOwnerNames(allRows, uid),
  ]);
  const ref = (row: LinkedRefRow) => toLinkedRef(row, uid, levels, names);

  return {
    self: ref(selfRow),
    source: srcRow ? ref(srcRow) : null,
    derived: (derivedRows ?? []).map(ref),
    lostSource,
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
  /**
   * True when the agent being overwritten is a SYSTEM agent. Only then does the
   * request carry the admin lane (admin feature "agent.system-sync"); writing
   * into a person's agent never does, so an admin on a user page can only
   * write into agents they could save themselves.
   */
  targetIsSystem?: boolean;
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
    targetIsSystem = false,
  }) => {
    const request = supabase.rpc("agx_sync_linked_agents_reviewed", {
      p_from_id: fromId,
      p_to_id: toId,
      p_include_identity: includeIdentity,
      p_expected_from_updated_at: expectedFromUpdatedAt,
      p_expected_to_updated_at: expectedToUpdatedAt,
    });
    // Writing into a SYSTEM agent from a user page is the registered admin
    // feature "agent.system-sync": only that request carries the admin lane.
    const { data, error } = await (targetIsSystem
      ? withAdminFeature("agent.system-sync", request)
      : request);
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
 * Creates the caller's own copy of any agent they can read (system, a friend's,
 * an organization's — "duplicating is not editing"), linked back to it via
 * `source_agent_id`. Idempotent: if the current user already has a non-archived
 * copy of this agent, that copy is returned instead of creating
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
