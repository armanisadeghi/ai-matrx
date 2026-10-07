/**
 * BUILDER TIER (chat-package P25) — the agent WRITE thunks: save, save one field, create,
 * delete (soft), duplicate, favorite. They left @ai-matrx/chat with the builder; the
 * package's agent headers reach them through the "builder" door
 * (imported directly by the builder's controls in features/agents).
 * Action types and behavior are unchanged.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { Database } from "@/types/database.types";
import { pgErrorToError } from "@ai-matrx/data";
import { tryWriteOne, writeOneRow } from "@ai-matrx/data/db";
import { assignField } from "@ai-matrx/agents/field-flags";
import { supabase } from "@ai-matrx/chat/host/db";
import { supabase as appDb } from "@/utils/supabase/client";
import { selectUserId } from "@ai-matrx/chat/host/identity";
import { selectOrganizationId, ensureOrgId } from "@ai-matrx/chat/host/org";
import { writeFavorite } from "@ai-matrx/chat/context/sources/scopes";
import type { ChatDispatch, ChatRootState } from "@ai-matrx/chat/store/root-state";
interface DuplicateAgentCommon {
  asSystem?: boolean;
  organizationId?: string;
  followsSource?: boolean;
  /** The copy's name; empty = "Name (Copy)" / "Name (vN copy)". A taken name gets " (2)". */
  name?: string;
}
/**
 * What to copy into a new agent: the agent as it is now (`agentId`), or one
 * exact saved version (`versionId`, an agent.definition_version id — its
 * snapshot is copied, never the possibly-newer master).
 */
type DuplicateAgentOptions = DuplicateAgentCommon &
  ({ agentId: string; versionId?: string } | { agentId?: string; versionId: string });
import type { AgentDefinition } from "@ai-matrx/chat/agents/types/agent-definition.types";
import { isSyntheticAgentId } from "@ai-matrx/chat/agents/redux/agent-definition/synthetic-id";
import { agentNameTakenError } from "@ai-matrx/chat/agents/redux/agent-definition/agentNameTaken";
import { selectAgentById } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  upsertAgent,
  mergePartialAgent,
  setAgentLoading,
  setAgentError,
  removeAgent,
} from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import {
  dbRowToAgentDefinition,
  agentDefinitionToInsert,
  agentDefinitionToUpdate,
} from "@ai-matrx/chat/agents/redux/agent-definition/converters";
import {
  fetchFullAgent,
} from "@/features/agents/redux/fetch-full-agent.thunk";

import {
  setAgentField, markAgentSaved, markAgentFieldSaved, rollbackAgentOptimisticUpdate,
} from "@/features/agents/redux/agent-builder.slice";
export type { DuplicateAgentOptions };

type ThunkApi = { dispatch: ChatDispatch; state: ChatRootState };

/**
 * Star or unstar an agent for the CALLER. The one agent favorite writer:
 * `favoritesService.setFavorite` → platform.user_entity_state. Optimistic
 * (not dirty), rolled back on a refusal, which is thrown in words.
 */
export const setAgentFavorite = createAsyncThunk<
  void,
  { agentId: string; isFavorite: boolean },
  ThunkApi
>(
  "agentDefinition/setFavorite",
  async ({ agentId, isFavorite }, { dispatch, getState }) => {
    // Only a record this registry already holds is patched — a list surface
    // that keeps its own rows (the /agents browse page) must not seed a
    // nameless record here just by starring.
    const existing = selectAgentById(getState(), agentId);
    const previous = existing?.isFavorite ?? false;
    if (existing) dispatch(mergePartialAgent({ id: agentId, isFavorite }));
    if (isSyntheticAgentId(agentId)) return;
    try {
      await writeFavorite("agent", agentId, isFavorite);
    } catch (err) {
      if (existing) {
        dispatch(mergePartialAgent({ id: agentId, isFavorite: previous }));
      }
      const message = err instanceof Error ? err.message : String(err);
      dispatch(setAgentError({ id: agentId, error: message }));
      throw err instanceof Error ? err : new Error(message);
    }
  },
);

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

    // A star is per-person state in platform.user_entity_state — never a
    // column write on agent.definition.
    if (field === "isFavorite") {
      await dispatch(
        setAgentFavorite({ agentId, isFavorite: Boolean(value) }),
      ).unwrap();
      return;
    }

    const existing = selectAgentById(getState(), agentId);
    const snapshot = existing ? { [field]: existing[field] } : {};

    dispatch(setAgentField({ id: agentId, field, value }));

    const { data, error } = await writeOneRow(
      supabase
        .schema("agent")
        .from("definition")
        .update(
          agentDefinitionToUpdate({ [field]: value } as Partial<AgentDefinition>),
        )
        .eq("id", agentId)
        .select("version, updated_at, follows_source"),
      { action: "update", noun: "definition" },
    );

    if (error) {
      dispatch(rollbackAgentOptimisticUpdate({ id: agentId, snapshot }));
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

    dispatch(markAgentFieldSaved({ id: agentId, field }));
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

    // A dirty star is per-person state: it goes to platform.user_entity_state,
    // never into the agent.definition update below.
    if (dirtyPartial.isFavorite !== undefined) {
      const isFavorite = dirtyPartial.isFavorite;
      delete dirtyPartial.isFavorite;
      await dispatch(setAgentFavorite({ agentId, isFavorite })).unwrap();
      if (Object.keys(dirtyPartial).length === 0) {
        dispatch(markAgentSaved({ id: agentId }));
        return;
      }
    }

    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await writeOneRow(
      supabase
        .schema("agent")
        .from("definition")
        .update(agentDefinitionToUpdate(dirtyPartial))
        .eq("id", agentId)
        .select("version, updated_at, follows_source"),
      { action: "update", noun: "definition" },
    );

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(rollbackAgentOptimisticUpdate({ id: agentId, snapshot }));
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
    // A new agent is saved where the person works: the org the caller names, else the active
    // one through the ONE hold-and-set gate (as duplicate does) — never a refusal while one is set.
    organizationId:
      partial.organizationId ?? (await ensureOrgId(selectOrganizationId(getState()))),
    taskId: partial.taskId ?? null,
    sourceAgentId: null,
    sourceSnapshotAt: null,
    followsSource: false,
    sourceVersion: null,
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
    // `created_via` is typed required by the generated Insert but is never sent: the
    // database stamps it on insert (`_created_via_from`), so it is omitted from the payload.
    .insert(
      agentDefinitionToInsert(
        draft,
      ) as Database["agent"]["Tables"]["definition"]["Insert"],
    )
    .select()
    .single();

  // A duplicate name is refused by the catalog in words (V24-TAILS); the sentence alone reaches the person.
  if (error) throw agentNameTakenError(error) ?? pgErrorToError(error);

  const newAgent = dbRowToAgentDefinition(data);
  dispatch(upsertAgent(newAgent));
  // The insert never carries a star; a caller that asked for one gets it in
  // platform.user_entity_state.
  if (partial.isFavorite) {
    await dispatch(
      setAgentFavorite({ agentId: newAgent.id, isFavorite: true }),
    ).unwrap();
  }
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
    const { error } = await tryWriteOne(
      supabase
        .schema("agent")
        .from("definition")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", agentId)
        .select("id"),
      { action: "delete", noun: "agent" },
    );

    if (error) throw pgErrorToError(error);

    dispatch(removeAgent(agentId));
  },
);


/**
 * THE one agent copy (UI: `useAgentDuplicateFlow`). Calls agent.duplicate_agent
 * (the agent as it is now) or agent.duplicate_version (one saved version);
 * both share the database's single copy core, so a copy carries the same
 * fields either way. Loads the copy into state and returns its id.
 *
 *   dispatch(duplicateAgent(agentId))                          // personal copy
 *   dispatch(duplicateAgent({ agentId, asSystem: true }))      // system copy (super admin)
 *   dispatch(duplicateAgent({ agentId, versionId, name }))     // a past version, named
 */
export const duplicateAgent = createAsyncThunk<
  string,
  string | DuplicateAgentOptions,
  ThunkApi
>("agentDefinition/duplicate", async (input, { dispatch, getState }) => {
  const { agentId, asSystem, organizationId: explicitOrganizationId, followsSource, versionId, name } =
    typeof input === "string"
      ? { agentId: input, asSystem: false, organizationId: undefined, followsSource: false, versionId: undefined, name: undefined }
      : input;

  // A personal copy lives in the organization the caller named, else the one the
  // person is working in — the database never picks one (it refuses a copy with
  // none). A system copy is placed in the platform org by the database itself.
  // org-filter: write-target a copy is filed in the organization the person works in
  const organizationId = asSystem
    ? undefined
    : await ensureOrgId(explicitOrganizationId ?? selectOrganizationId(getState()));

  // A chosen past version is copied from its immutable snapshot (the copy
  // records which version it came from and never follows the source); no
  // version = the agent as it is now.
  const { data, error } = versionId
    ? await appDb.schema("agent").rpc("duplicate_version", {
        p_version_id: versionId,
        p_as_system: Boolean(asSystem),
        p_organization_id: organizationId,
        p_name: name,
      })
    : await appDb.schema("agent").rpc("duplicate_agent", {
        // The options type guarantees an agent id whenever no version is named.
        p_agent_id: agentId as string,
        p_as_system: Boolean(asSystem),
        p_organization_id: organizationId,
        p_follows_source: Boolean(followsSource),
        p_name: name,
      });

  if (error) throw pgErrorToError(error);

  const newAgentId = data as string;
  await dispatch(fetchFullAgent(newAgentId));
  return newAgentId;
});
