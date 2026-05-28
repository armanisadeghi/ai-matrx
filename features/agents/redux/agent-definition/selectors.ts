"use client";

import { createSelector } from "reselect";
import type { RootState } from "@/lib/redux/store";
import type {
  AgentDefinition,
  AgentDefinitionRecord,
  AgentFetchStatus,
} from "../../types/agent-definition.types";
import type { FieldFlags } from "../shared/field-flags";
import { fieldFlagsSize, hasField } from "../shared/field-flags";

// ---------------------------------------------------------------------------
// Slice root
// ---------------------------------------------------------------------------

const selectAgentDefinitionSlice = (state: RootState) => state.agentDefinition;

// ---------------------------------------------------------------------------
// Registry & active id
// ---------------------------------------------------------------------------

export const selectAllAgents = createSelector(
  [selectAgentDefinitionSlice],
  (slice) => slice.agents,
);

export const selectActiveAgentId = createSelector(
  [selectAgentDefinitionSlice],
  (slice) => slice.activeAgentId,
);

export const selectAgentsSliceStatus = createSelector(
  [selectAgentDefinitionSlice],
  (slice) => slice.status,
);

export const selectAgentsSliceError = createSelector(
  [selectAgentDefinitionSlice],
  (slice) => slice.error,
);

// ---------------------------------------------------------------------------
// Single record by id (works for live agents AND version snapshots)
// ---------------------------------------------------------------------------

/** Returns the full record (including runtime flags) or undefined. */
export const selectAgentById = createSelector(
  [selectAllAgents, (_state: RootState, id: string) => id],
  (agents, id): AgentDefinitionRecord | undefined => agents[id],
);

/**
 * Whether automatic tool injection is DISABLED for this agent
 * (`tool_config.auto_tools_disabled`). The Builder's "Allow automated tool
 * injection" switch shows the inverse. Defaults false (injection allowed).
 */
export const selectAgentAutoToolsDisabled = createSelector(
  [selectAgentById],
  (record): boolean => record?.autoToolsDisabled ?? false,
);

/**
 * Returns the fetch status for a given agent record.
 * undefined when the record does not exist in state.
 * null when the record exists but no fetch has completed.
 */
export const selectAgentFetchStatus = createSelector(
  [selectAgentById],
  (record): AgentFetchStatus | null | undefined => {
    if (!record) return undefined;
    return record._fetchStatus;
  },
);

/** Returns the pure domain fields (no _ prefixed runtime flags). */
export const selectAgentDefinition = createSelector(
  [selectAgentById],
  (record): AgentDefinition | undefined => {
    if (!record) return undefined;
    const {
      _dirty,
      _dirtyFields,
      _fieldHistory,
      _loadedFields,
      _loading,
      _error,
      _undoPast,
      _undoFuture,
      ...definition
    } = record;
    return definition;
  },
);

// ---------------------------------------------------------------------------
// Fetch-status boolean selectors
//
// The thunk that performed the fetch is the only authoritative source for
// "what data this record contains". It sets _fetchStatus via setAgentFetchStatus
// (partial fetches) or implicitly via upsertAgent (full / versionSnapshot).
// Never infer readiness from field presence — a field can arrive via a
// different, narrower fetch and would give a false positive.
//
// Each selector below builds on selectAgentFetchStatus (already a memoized
// primitive) and does a pure boolean comparison — safe with useAppSelector.
// ---------------------------------------------------------------------------

/**
 * True when the record has enough data to render an agent card.
 * Requires: list | full | versionSnapshot
 * (execution* statuses don't include name / description)
 */
export const selectAgentReadyForDisplay = createSelector(
  [selectAgentFetchStatus],
  (status): boolean =>
    status === "list" || status === "full" || status === "versionSnapshot",
);

/**
 * True when the record has enough data for basic (minimal) execution.
 * Requires: execution | customExecution | full | versionSnapshot
 */
export const selectAgentReadyForExecution = createSelector(
  [selectAgentFetchStatus],
  (status): boolean =>
    status === "execution" ||
    status === "customExecution" ||
    status === "full" ||
    status === "versionSnapshot",
);

/**
 * True when the record has enough data for custom execution
 * (adds settings, tools, model on top of the minimal execution set).
 * Requires: customExecution | full | versionSnapshot
 */
export const selectAgentReadyForCustomExecution = createSelector(
  [selectAgentFetchStatus],
  (status): boolean =>
    status === "customExecution" ||
    status === "full" ||
    status === "versionSnapshot",
);

/**
 * True when the record is ready for the agent builder / editor.
 * Requires: full | versionSnapshot
 * This is the gate used by AgentBuilder before mounting the builder UI.
 */
export const selectAgentReadyForBuilder = createSelector(
  [selectAgentFetchStatus],
  (status): boolean => status === "full" || status === "versionSnapshot",
);

/**
 * True when the record is a version snapshot.
 * Requires: versionSnapshot
 */
export const selectAgentReadyForVersionDisplay = createSelector(
  [selectAgentFetchStatus],
  (status): boolean => status === "versionSnapshot",
);

// ---------------------------------------------------------------------------
// Execution readiness
// ---------------------------------------------------------------------------

/**
 * Returns true if the record has the fields needed for execution
 * AND those fields have been explicitly fetched (not just defaulted to empty).
 */
export const selectAgentCanExecute = createSelector(
  [selectAgentById],
  (record): boolean => {
    if (!record) return false;
    return (
      hasField(record._loadedFields, "variableDefinitions") &&
      hasField(record._loadedFields, "contextSlots")
    );
  },
);

/**
 * Minimal execution payload.
 * Works for both live agents (isVersion = false) and version snapshots (isVersion = true).
 * The backend uses resolvedId + isVersion to know which table to query.
 * isReady: false → thunk must call fetchAgentExecutionMinimal (agx_get_execution_minimal) first.
 */
export const selectAgentExecutionPayload = createSelector(
  [selectAgentById],
  (record) => {
    if (!record) {
      return {
        isReady: false as const,
        resolvedId: null,
        isVersion: false as const,
        variableDefinitions: null,
        contextSlots: [],
      };
    }
    const isReady =
      hasField(record._loadedFields, "variableDefinitions") &&
      hasField(record._loadedFields, "contextSlots");
    return {
      isReady,
      resolvedId: record.id,
      isVersion: record.isVersion,
      variableDefinitions: record.variableDefinitions,
      contextSlots: record.contextSlots,
    };
  },
);

/**
 * Custom execution payload — adds settings, tools, model for pre-run overrides.
 * Works for both live agents and version snapshots.
 * isReady: false → thunk must call fetchAgentExecutionFull (agx_get_execution_full) first.
 */
export const selectAgentCustomExecutionPayload = createSelector(
  [selectAgentById],
  (record) => {
    const required: (keyof AgentDefinition)[] = [
      "variableDefinitions",
      "contextSlots",
      "settings",
      "tools",
      "customTools",
      "modelId",
    ];
    if (!record) {
      return {
        isReady: false as const,
        resolvedId: null,
        isVersion: false as const,
        variableDefinitions: null,
        contextSlots: [],
        settings: null,
        tools: [],
        customTools: [],
        modelId: null,
      };
    }
    const isReady = required.every((f) => hasField(record._loadedFields, f));
    return {
      isReady,
      resolvedId: record.id,
      isVersion: record.isVersion,
      variableDefinitions: record.variableDefinitions,
      contextSlots: record.contextSlots,
      settings: record.settings,
      tools: record.tools,
      customTools: record.customTools,
      modelId: record.modelId,
    };
  },
);

// ---------------------------------------------------------------------------
// Individual fields
// ---------------------------------------------------------------------------

export const selectAgentName = createSelector(
  [selectAgentById],
  (record) => record?.name,
);

export const selectAgentDescription = createSelector(
  [selectAgentById],
  (record) => record?.description ?? null,
);

export const selectAgentType = createSelector(
  [selectAgentById],
  (record) => record?.agentType ?? null,
);

export const selectAgentModelId = createSelector(
  [selectAgentById],
  (record) => record?.modelId ?? null,
);

/**
 * True when the agent has no model selected (modelId is null or empty string).
 * Used to show warnings in the builder UI without blocking saves.
 */
export const selectAgentModelMissing = createSelector(
  [selectAgentById],
  (record): boolean => !record?.modelId,
);

export const selectAgentMessages = createSelector(
  [selectAgentById],
  (record) => record?.messages,
);

/**
 * Returns a single message at `index` from the full messages array.
 * Returns undefined when the record or index doesn't exist — handle in component.
 */
export const selectAgentMessageAtIndex = createSelector(
  [selectAgentById, (_state: RootState, _id: string, index: number) => index],
  (record, index) => record?.messages?.[index],
);

/**
 * Returns the full system message object — all content blocks intact, raw from Redux.
 * Returns undefined when no record or no system message exists — handle in component.
 * Do NOT extract fields here. Components iterate the blocks themselves.
 */
export const selectAgentSystemMessage = createSelector(
  [selectAgentById],
  (record) => record?.messages?.find((m) => m.role === "system"),
);

/**
 * Returns the indices (into the full messages array) of all non-system messages.
 * Returns undefined when the record doesn't exist — handle in component.
 */
export const selectAgentConversationMessageIndices = createSelector(
  [selectAgentById],
  (record) => {
    if (!record?.messages) return undefined;
    return record.messages.reduce<number[]>((acc, m, i) => {
      if (m.role !== "system") acc.push(i);
      return acc;
    }, []);
  },
);

export const selectAgentVariableDefinitions = createSelector(
  [selectAgentById],
  (record) => record?.variableDefinitions ?? null,
);

export const selectAgentContextSlots = createSelector(
  [selectAgentById],
  (record) => record?.contextSlots,
);

export const selectAgentSettings = createSelector(
  [selectAgentById],
  (record) => record?.settings ?? null,
);

export const selectAgentTools = createSelector(
  [selectAgentById],
  (record) => record?.tools,
);

export const selectAgentCustomTools = createSelector(
  [selectAgentById],
  (record) => record?.customTools,
);

export const selectAgentMcpServers = createSelector(
  [selectAgentById],
  (record) => record?.mcpServers,
);

/** Per-agent skill visibility config. Returns the empty default when the
 * record is missing or hasn't loaded yet so the picker UI renders without
 * a null-check noise. */
export const selectAgentSkillConfig = createSelector(
  [selectAgentById],
  (record) =>
    record?.skillConfig ?? {
      included: [],
      listed: [],
      forbidden: [],
      disabled: false,
    },
);

export const selectAgentModelTiers = createSelector(
  [selectAgentById],
  (record) => record?.modelTiers ?? null,
);

export const selectAgentOutputSchema = createSelector(
  [selectAgentById],
  (record) => record?.outputSchema ?? null,
);

export const selectAgentTags = createSelector(
  [selectAgentById],
  (record) => record?.tags,
);

export const selectAgentCategory = createSelector(
  [selectAgentById],
  (record) => record?.category ?? null,
);

// Version-specific fields (only meaningful when record.isVersion = true)
export const selectAgentIsVersion = createSelector(
  [selectAgentById],
  (record): boolean => record?.isVersion ?? false,
);

export const selectAgentParentAgentId = createSelector(
  [selectAgentById],
  (record) => record?.parentAgentId ?? null,
);

export const selectAgentVersion = createSelector(
  [selectAgentById],
  (record) => record?.version ?? null,
);

export const selectAgentChangeNote = createSelector(
  [selectAgentById],
  (record) => record?.changeNote ?? null,
);

// ---------------------------------------------------------------------------
// Status flags
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

export const selectAgentCanUndo = createSelector(
  [selectAgentById],
  (record): boolean => (record?._undoPast.length ?? 0) > 0,
);

export const selectAgentCanRedo = createSelector(
  [selectAgentById],
  (record): boolean => (record?._undoFuture.length ?? 0) > 0,
);

export const selectAgentUndoDepth = createSelector(
  [selectAgentById],
  (record): number => record?._undoPast.length ?? 0,
);

export const selectAgentRedoDepth = createSelector(
  [selectAgentById],
  (record): number => record?._undoFuture.length ?? 0,
);

// ---------------------------------------------------------------------------
// Status flags
// ---------------------------------------------------------------------------

/**
 * True if the agent has unsaved edits. Derived from `_dirtyFields` rather than
 * reading the `_dirty` bit directly so the flag can never drift out of sync
 * with the actual list of changed fields (which is what the diff viewer uses).
 * If `_dirtyFields` is empty, the record is clean — period.
 */
export const selectAgentIsDirty = createSelector(
  [selectAgentById],
  (record): boolean =>
    record ? fieldFlagsSize(record._dirtyFields) > 0 : false,
);

export const selectAgentDirtyFields = createSelector(
  [selectAgentById],
  (record): FieldFlags<keyof AgentDefinition> | undefined =>
    record?._dirtyFields,
);

export const selectAgentFieldHistory = createSelector(
  [selectAgentById],
  (record) => record?._fieldHistory,
);

export const selectAgentLoadedFields = createSelector(
  [selectAgentById],
  (record): FieldFlags<keyof AgentDefinition> | undefined =>
    record?._loadedFields,
);

export const selectAgentIsLoading = createSelector(
  [selectAgentById],
  (record): boolean => record?._loading ?? false,
);

export const selectAgentError = createSelector(
  [selectAgentById],
  (record): string | null => record?._error ?? null,
);

export const selectAgentIsActive = createSelector(
  [selectAgentById],
  (record): boolean => record?.isActive ?? false,
);

export const selectAgentIsPublic = createSelector(
  [selectAgentById],
  (record): boolean => record?.isPublic ?? false,
);

export const selectAgentIsArchived = createSelector(
  [selectAgentById],
  (record): boolean => record?.isArchived ?? false,
);

export const selectAgentIsFavorite = createSelector(
  [selectAgentById],
  (record): boolean => record?.isFavorite ?? false,
);

/** Returns the original (pre-edit) value for a single dirty field. */
export const selectAgentFieldOriginalValue = createSelector(
  [
    selectAgentById,
    (_state: RootState, _id: string, field: keyof AgentDefinition) => field,
  ],
  (record, field) => record?._fieldHistory[field] ?? undefined,
);

/** True if a specific field has been fetched. */
export const selectAgentFieldIsLoaded = createSelector(
  [
    selectAgentById,
    (_state: RootState, _id: string, field: keyof AgentDefinition) => field,
  ],
  (record, field): boolean =>
    record ? hasField(record._loadedFields, field) : false,
);

// ---------------------------------------------------------------------------
// Lineage / metadata
// ---------------------------------------------------------------------------

export const selectAgentSourceId = createSelector(
  [selectAgentById],
  (record) => record?.sourceAgentId ?? null,
);

export const selectAgentIsForked = createSelector(
  [selectAgentById],
  (record): boolean => record?.sourceAgentId != null,
);

// ---------------------------------------------------------------------------
// Access metadata (populated by fetchAgentsList / fetchAgentAccessLevel)
// null = not yet fetched — do not infer permissions from null
// ---------------------------------------------------------------------------

export const selectAgentIsOwner = createSelector(
  [selectAgentById],
  (record) => record?.isOwner ?? null,
);

export const selectAgentAccessLevel = createSelector(
  [selectAgentById],
  (record) => record?.accessLevel ?? null,
);

export const selectAgentSharedByEmail = createSelector(
  [selectAgentById],
  (record) => record?.sharedByEmail ?? null,
);

/** True only when we've confirmed the current user owns the agent. */
export const selectAgentIsConfirmedOwner = createSelector(
  [selectAgentById],
  (record): boolean => record?.isOwner === true,
);

/** True when we know the user can edit (owner, admin, or editor). */
export const selectAgentIsEditable = createSelector(
  [selectAgentById],
  (record): boolean => {
    const level = record?.accessLevel;
    return level === "owner" || level === "admin" || level === "editor";
  },
);

/** True when we know the user is at least a viewer (any known access). */
export const selectAgentIsAccessible = createSelector(
  [selectAgentById],
  (record): boolean => record?.accessLevel != null,
);

// ---------------------------------------------------------------------------
// List-level selectors (all records)
// ---------------------------------------------------------------------------

export const selectAllAgentIds = createSelector(
  [selectAllAgents],
  (agents): string[] => Object.keys(agents),
);

export const selectAllAgentsArray = createSelector(
  [selectAllAgents],
  (agents): AgentDefinitionRecord[] => Object.values(agents),
);

/** Live agents only (isVersion = false). */
export const selectLiveAgents = createSelector(
  [selectAllAgentsArray],
  (agents) => agents.filter((a) => !a.isVersion),
);

/** Version snapshot records only (isVersion = true). */
export const selectAllVersionRecords = createSelector(
  [selectAllAgentsArray],
  (agents) => agents.filter((a) => a.isVersion),
);

/** All version snapshots for a given parent agent id, sorted oldest → newest. */
export const selectVersionsByParentAgentId = createSelector(
  [
    selectAllAgentsArray,
    (_state: RootState, parentAgentId: string) => parentAgentId,
  ],
  (agents, parentAgentId) =>
    agents
      .filter((a) => a.isVersion && a.parentAgentId === parentAgentId)
      .sort((a, b) => (a.version ?? 0) - (b.version ?? 0)),
);

export const selectUserAgents = createSelector([selectLiveAgents], (agents) =>
  agents.filter((a) => a.agentType === "user"),
);

/** Builtin/system agents — only present after fetchAgentsListFull(). */
export const selectBuiltinAgents = createSelector(
  [selectLiveAgents],
  (agents) => agents.filter((a) => a.agentType === "builtin"),
);

/** Alias for selectBuiltinAgents — matches the access_level = 'system' label. */
export const selectSystemAgents = selectBuiltinAgents;

export const selectActiveAgents = createSelector([selectLiveAgents], (agents) =>
  agents.filter((a) => a.isActive && !a.isArchived),
);

export const selectFavoriteAgents = createSelector(
  [selectLiveAgents],
  (agents) => agents.filter((a) => a.isFavorite),
);

export const selectDirtyAgents = createSelector(
  [selectAllAgentsArray],
  (agents) => agents.filter((a) => a._dirty),
);

/** Live agents the current user owns. */
export const selectOwnedAgents = createSelector([selectLiveAgents], (agents) =>
  agents.filter((a) => a.isOwner === true),
);

/** Live agents shared with the current user (not owned). */
export const selectSharedWithMeAgents = createSelector(
  [selectLiveAgents],
  (agents) =>
    agents.filter((a) => a.isOwner === false && a.accessLevel != null),
);

/** Live agents the current user can edit (owner / admin / editor). */
export const selectEditableAgents = createSelector(
  [selectLiveAgents],
  (agents) =>
    agents.filter(
      (a) =>
        a.accessLevel === "owner" ||
        a.accessLevel === "admin" ||
        a.accessLevel === "editor",
    ),
);

export const selectAgentsByCategory = createSelector(
  [selectAllAgentsArray, (_state: RootState, category: string) => category],
  (agents, category) => agents.filter((a) => a.category === category),
);

// ---------------------------------------------------------------------------
// Active agent (shorthand — requires activeAgentId to be set)
// ---------------------------------------------------------------------------

export const selectActiveAgent = createSelector(
  [selectAllAgents, selectActiveAgentId],
  (agents, id): AgentDefinitionRecord | undefined =>
    id != null ? agents[id] : undefined,
);

export const selectActiveAgentIsDirty = createSelector(
  [selectActiveAgent],
  (record): boolean => record?._dirty ?? false,
);

export const selectActiveAgentIsLoading = createSelector(
  [selectActiveAgent],
  (record): boolean => record?._loading ?? false,
);

export const selectActiveAgentCanExecute = createSelector(
  [selectActiveAgent],
  (record): boolean => {
    if (!record) return false;
    return (
      hasField(record._loadedFields, "variableDefinitions") &&
      hasField(record._loadedFields, "contextSlots")
    );
  },
);

/** Active agent execution payload — same shape as selectAgentExecutionPayload. */
export const selectActiveAgentExecutionPayload = createSelector(
  [selectActiveAgent],
  (record) => {
    if (!record) {
      return {
        isReady: false as const,
        resolvedId: null,
        isVersion: false as const,
        variableDefinitions: null,
        contextSlots: [],
      };
    }
    const isReady =
      hasField(record._loadedFields, "variableDefinitions") &&
      hasField(record._loadedFields, "contextSlots");
    return {
      isReady,
      resolvedId: record.id,
      isVersion: record.isVersion,
      variableDefinitions: record.variableDefinitions,
      contextSlots: record.contextSlots,
    };
  },
);
