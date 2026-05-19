/**
 * Tools-mode thunks.
 *
 * Locked across columns: agent (source) + version + variables + user
 * message + system prompt + LLM settings. Varied per column: the
 * agent's attached tools (built-in tool ids, custom tools, MCP
 * servers). Each column owns a SYNTHETIC clone of the locked agent —
 * a `cmp-<uuid>` AgentDefinition record kept entirely in Redux.
 *
 * The per-column tools editor is the existing `AgentToolsManager`
 * component pointed at the synthetic id, so adding/removing tools
 * writes to the synthetic record and the manual-execute path sends
 * the column's tool list with each request — no special routing.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  createInstance,
  destroyInstance,
} from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import {
  fetchFullAgent,
  fetchAgentVersionHistory,
  fetchAgentVersionSnapshot,
} from "@/features/agents/redux/agent-definition/thunks";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  removeAgent,
  setAgentCustomTools,
  setAgentMcpServers,
  setAgentTools,
} from "@/features/agents/redux/agent-definition/slice";
import { generateConversationId } from "@/features/agents/redux/execution-system/utils/ids";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  createComparisonSet,
  loadComparisonSet,
  renameComparisonSet,
  replaceEntries,
  type UpsertEntryInput,
} from "@/features/agent-comparison/service/comparisonSetsService";
import {
  forkAgentForVariant,
  isSyntheticAgentId,
} from "@/features/agent-comparison/shared/forkAgentForVariant";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import {
  addToolsColumn,
  removeToolsColumn,
  replaceToolsColumn,
  resetTools,
  setActiveToolsSet,
  setLocked,
  setToolsColumns,
  submitAllFinished,
  submitAllStarted,
} from "./slice";
import type { ToolsColumn } from "../types";

// =============================================================================
// Page-wide constants
// =============================================================================

export const TOOLS_SURFACE_KEY = "agent-comparison-tools";
const TOOLS_SOURCE_FEATURE = "agent-comparison" as const;

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

// =============================================================================
// Tool-bundle helpers
// =============================================================================

interface ToolBundle {
  tools: AgentDefinition["tools"];
  customTools: AgentDefinition["customTools"];
  mcpServers: AgentDefinition["mcpServers"];
}

const EMPTY_BUNDLE: ToolBundle = {
  tools: [],
  customTools: [],
  mcpServers: [],
};

function extractToolBundle(state: RootState, agentId: string): ToolBundle {
  const agent = state.agentDefinition.agents?.[agentId];
  if (!agent) return EMPTY_BUNDLE;
  return {
    tools: agent.tools ?? [],
    customTools: agent.customTools ?? [],
    mcpServers: agent.mcpServers ?? [],
  };
}

function applyToolBundle(
  dispatch: AppDispatch,
  agentId: string,
  bundle: ToolBundle,
) {
  dispatch(setAgentTools({ id: agentId, tools: bundle.tools }));
  dispatch(
    setAgentCustomTools({ id: agentId, customTools: bundle.customTools }),
  );
  dispatch(
    setAgentMcpServers({ id: agentId, mcpServers: bundle.mcpServers }),
  );
}

function teardownColumn(dispatch: AppDispatch, col: ToolsColumn) {
  dispatch(destroyInstance(col.conversationId));
  if (isSyntheticAgentId(col.syntheticAgentId)) {
    dispatch(removeAgent(col.syntheticAgentId));
  }
}

// =============================================================================
// Locked-axis configuration
// =============================================================================

export const setLockedSourceAgent = createAsyncThunk<
  void,
  { agentId: string },
  ThunkApi
>(
  "agentComparisonTools/setLockedSourceAgent",
  async ({ agentId }, { dispatch, getState }) => {
    const state = getState();
    const prev = state.agentComparisonTools.locked;
    if (prev.sourceAgentId === agentId) return;

    await Promise.allSettled([
      dispatch(fetchFullAgent(agentId)).unwrap(),
      dispatch(
        fetchAgentVersionHistory({ agentId, limit: 100 }),
      ).unwrap(),
    ]);

    dispatch(
      setLocked({
        sourceAgentId: agentId,
        agentVersion: "current",
        agentVersionId: null,
        variables: {},
      }),
    );

    // Recreate every column with a fresh synthetic forked from the new
    // source agent. Per-column tool edits drop with the source change —
    // a new agent is a new baseline.
    const post = getState();
    for (const col of post.agentComparisonTools.columns) {
      teardownColumn(dispatch, col);
      const syntheticId = forkAgentForVariant(dispatch, post, agentId);
      if (!syntheticId) continue;
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: syntheticId,
          conversationId,
          apiEndpointMode: "manual",
          sourceFeature: TOOLS_SOURCE_FEATURE,
        }),
      ).unwrap();
      dispatch(
        replaceToolsColumn({
          columnId: col.columnId,
          next: { conversationId, syntheticAgentId: syntheticId },
        }),
      );
    }
  },
);

export const setLockedVersion = createAsyncThunk<
  void,
  { version: "current" | number; versionId?: string },
  ThunkApi
>(
  "agentComparisonTools/setLockedVersion",
  async ({ version, versionId }, { dispatch, getState }) => {
    const state = getState();
    const { sourceAgentId, agentVersion } = state.agentComparisonTools.locked;
    if (!sourceAgentId) return;
    if (agentVersion === version) return;

    if (version !== "current") {
      try {
        await dispatch(
          fetchAgentVersionSnapshot({ agentId: sourceAgentId, version }),
        ).unwrap();
      } catch {
        // non-fatal
      }
    }

    dispatch(
      setLocked({
        agentVersion: version,
        agentVersionId: version === "current" ? null : versionId ?? null,
      }),
    );

    const post = getState();
    const forkSourceId =
      version === "current" ? sourceAgentId : versionId ?? sourceAgentId;

    for (const col of post.agentComparisonTools.columns) {
      teardownColumn(dispatch, col);
      const syntheticId = forkAgentForVariant(dispatch, post, forkSourceId);
      if (!syntheticId) continue;
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: syntheticId,
          conversationId,
          apiEndpointMode: "manual",
          sourceFeature: TOOLS_SOURCE_FEATURE,
        }),
      ).unwrap();
      dispatch(
        replaceToolsColumn({
          columnId: col.columnId,
          next: { conversationId, syntheticAgentId: syntheticId },
        }),
      );
    }
  },
);

// =============================================================================
// Columns
// =============================================================================

export const addColumnToToolsBattle = createAsyncThunk<
  string | null,
  { label?: string } | undefined,
  ThunkApi
>(
  "agentComparisonTools/addColumn",
  async (arg, { dispatch, getState }) => {
    const state = getState();
    const { sourceAgentId, agentVersion, agentVersionId } =
      state.agentComparisonTools.locked;
    if (!sourceAgentId) return null;

    const forkSourceId =
      agentVersion === "current" || !agentVersionId
        ? sourceAgentId
        : agentVersionId;

    const syntheticId = forkAgentForVariant(dispatch, state, forkSourceId);
    if (!syntheticId) return null;

    const columnId = crypto.randomUUID();
    const conversationId = generateConversationId();
    const label =
      arg?.label ??
      `Variant ${state.agentComparisonTools.columns.length + 1}`;

    await dispatch(
      createManualInstance({
        agentId: syntheticId,
        conversationId,
        apiEndpointMode: "manual",
        sourceFeature: TOOLS_SOURCE_FEATURE,
      }),
    ).unwrap();

    dispatch(
      addToolsColumn({
        columnId,
        conversationId,
        syntheticAgentId: syntheticId,
        label,
      }),
    );
    return columnId;
  },
);

export const removeColumnFromToolsBattle = createAsyncThunk<
  void,
  { columnId: string },
  ThunkApi
>(
  "agentComparisonTools/removeColumn",
  async ({ columnId }, { dispatch, getState }) => {
    const state = getState();
    const col = state.agentComparisonTools.columns.find(
      (c) => c.columnId === columnId,
    );
    if (col) teardownColumn(dispatch, col);
    dispatch(removeToolsColumn({ columnId }));
  },
);

// =============================================================================
// Submit All
// =============================================================================

export const submitAllTools = createAsyncThunk<
  { launched: number; failed: number; skipped: number },
  void,
  ThunkApi
>(
  "agentComparisonTools/submitAll",
  async (_arg, { dispatch, getState }) => {
    dispatch(submitAllStarted());
    try {
      const state = getState();
      const { sourceAgentId, variables, userMessage } =
        state.agentComparisonTools.locked;
      const columns = state.agentComparisonTools.columns;

      if (!sourceAgentId || columns.length === 0) {
        return { launched: 0, failed: 0, skipped: columns.length };
      }

      for (const col of columns) {
        if (userMessage) {
          dispatch(
            setUserInputText({
              conversationId: col.conversationId,
              text: userMessage,
            }),
          );
        }
        if (Object.keys(variables).length > 0) {
          dispatch(
            setUserVariableValues({
              conversationId: col.conversationId,
              values: variables,
            }),
          );
        }
      }

      const results = await Promise.allSettled(
        columns.map((col) =>
          dispatch(
            smartExecute({
              conversationId: col.conversationId,
              surfaceKey: TOOLS_SURFACE_KEY,
            }),
          ).unwrap(),
        ),
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      const launched = results.length - failed;

      const post = getState();
      const activeSetId = post.agentComparisonTools.activeSetId;
      if (activeSetId) {
        const entries = buildToolsEntries(post);
        try {
          await replaceEntries(activeSetId, entries);
          await renameComparisonSet(
            activeSetId,
            post.agentComparisonTools.activeSetName ?? "Untitled comparison",
          );
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            "[tools] failed to persist comparison entries:",
            err,
          );
        }
      }

      return { launched, failed, skipped: 0 };
    } finally {
      dispatch(submitAllFinished());
    }
  },
);

// =============================================================================
// Clear / reset
// =============================================================================

export const clearToolsBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonTools/clear",
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    for (const col of state.agentComparisonTools.columns) {
      teardownColumn(dispatch, col);
    }
    dispatch(resetTools());
  },
);

export const resetAllToolsConversations = createAsyncThunk<
  void,
  { preserveInputs?: boolean } | undefined,
  ThunkApi
>(
  "agentComparisonTools/resetAllConversations",
  async (arg, { dispatch, getState }) => {
    const preserveInputs = arg?.preserveInputs ?? true;
    const state = getState();
    const { sourceAgentId, agentVersion, agentVersionId } =
      state.agentComparisonTools.locked;
    if (!sourceAgentId) return;

    const forkSourceId =
      agentVersion === "current" || !agentVersionId
        ? sourceAgentId
        : agentVersionId;

    for (const col of state.agentComparisonTools.columns) {
      const savedBundle = preserveInputs
        ? extractToolBundle(state, col.syntheticAgentId)
        : null;

      teardownColumn(dispatch, col);

      const fresh = getState();
      const syntheticId = forkAgentForVariant(dispatch, fresh, forkSourceId);
      if (!syntheticId) continue;
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: syntheticId,
          conversationId,
          apiEndpointMode: "manual",
          sourceFeature: TOOLS_SOURCE_FEATURE,
        }),
      ).unwrap();
      if (savedBundle) {
        applyToolBundle(dispatch, syntheticId, savedBundle);
      }
      dispatch(
        replaceToolsColumn({
          columnId: col.columnId,
          next: { conversationId, syntheticAgentId: syntheticId },
        }),
      );
    }
  },
);

// =============================================================================
// Save / Load
// =============================================================================

interface PersistedToolsEntryMeta {
  label: string;
  tools: AgentDefinition["tools"];
  custom_tools: AgentDefinition["customTools"];
  mcp_servers: AgentDefinition["mcpServers"];
}

function buildToolsEntries(state: RootState): UpsertEntryInput[] {
  const out: UpsertEntryInput[] = [];
  const { sourceAgentId, agentVersion, agentVersionId } =
    state.agentComparisonTools.locked;
  if (!sourceAgentId) return out;
  state.agentComparisonTools.columns.forEach((col, idx) => {
    const bundle = extractToolBundle(state, col.syntheticAgentId);
    const meta: PersistedToolsEntryMeta = {
      label: col.label,
      tools: bundle.tools,
      custom_tools: bundle.customTools,
      mcp_servers: bundle.mcpServers,
    };
    out.push({
      conversationId: col.conversationId,
      displayOrder: idx,
      agentId: sourceAgentId,
      agentVersion:
        agentVersion === "current" || agentVersion == null
          ? null
          : agentVersion,
      agentVersionSnapshotId: agentVersionId,
      metadata: meta as unknown as Record<string, unknown>,
    });
  });
  return out;
}

function buildSetMetadata(state: RootState): Record<string, unknown> {
  const {
    sourceAgentId,
    agentVersion,
    agentVersionId,
    variables,
    userMessage,
  } = state.agentComparisonTools.locked;
  return {
    mode: "tools",
    locked: {
      source_agent_id: sourceAgentId,
      agent_version: agentVersion,
      agent_version_id: agentVersionId,
      variables,
      user_message: userMessage,
    },
  };
}

export const saveToolsBattleAs = createAsyncThunk<
  { id: string; name: string },
  { name: string },
  ThunkApi
>(
  "agentComparisonTools/saveAs",
  async ({ name }, { dispatch, getState }) => {
    const state = getState();
    const userId = selectUserId(state);
    if (!userId) throw new Error("Not signed in");

    const set = await createComparisonSet({
      name,
      userId,
      metadata: buildSetMetadata(state),
    });
    const entries = buildToolsEntries(state);
    if (entries.length > 0) {
      await replaceEntries(set.id, entries);
    }
    dispatch(setActiveToolsSet({ id: set.id, name: set.name }));
    return { id: set.id, name: set.name };
  },
);

export const saveToolsBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonTools/save",
  async (_arg, { getState }) => {
    const state = getState();
    const setId = state.agentComparisonTools.activeSetId;
    if (!setId) throw new Error("No active comparison set");
    const entries = buildToolsEntries(state);
    await replaceEntries(setId, entries);
  },
);

interface LoadedLockedSpec {
  source_agent_id: string | null;
  agent_version: "current" | number | null;
  agent_version_id: string | null;
  variables: Record<string, unknown>;
  user_message: string;
}

export const loadToolsBattleSet = createAsyncThunk<
  void,
  { setId: string },
  ThunkApi
>(
  "agentComparisonTools/loadSet",
  async ({ setId }, { dispatch, getState }) => {
    const before = getState();
    for (const col of before.agentComparisonTools.columns) {
      teardownColumn(dispatch, col);
    }
    dispatch(resetTools());

    const { set, entries } = await loadComparisonSet(setId);
    const meta = (set.metadata ?? {}) as {
      mode?: string;
      locked?: LoadedLockedSpec;
    };
    if (meta.mode !== "tools") {
      throw new Error(
        `Comparison set "${set.name}" is not a tools-mode set (mode=${meta.mode ?? "?"})`,
      );
    }

    const locked = meta.locked ?? null;
    let forkSourceId: string | null = null;
    if (locked?.source_agent_id) {
      try {
        await dispatch(fetchFullAgent(locked.source_agent_id)).unwrap();
        await dispatch(
          fetchAgentVersionHistory({
            agentId: locked.source_agent_id,
            limit: 100,
          }),
        ).unwrap();
      } catch {
        // best effort
      }

      if (
        locked.agent_version &&
        locked.agent_version !== "current" &&
        typeof locked.agent_version === "number"
      ) {
        try {
          await dispatch(
            fetchAgentVersionSnapshot({
              agentId: locked.source_agent_id,
              version: locked.agent_version,
            }),
          ).unwrap();
        } catch {
          // best effort
        }
      }

      forkSourceId =
        locked.agent_version === "current" || !locked.agent_version_id
          ? locked.source_agent_id
          : locked.agent_version_id;

      dispatch(
        setLocked({
          sourceAgentId: locked.source_agent_id,
          agentVersion: locked.agent_version ?? "current",
          agentVersionId: locked.agent_version_id ?? null,
          variables: locked.variables ?? {},
          userMessage: locked.user_message ?? "",
        }),
      );
    }

    const nextColumns: ToolsColumn[] = [];
    for (const entry of entries) {
      const columnId = crypto.randomUUID();
      const entryMeta = (entry.metadata ?? {}) as
        | Partial<PersistedToolsEntryMeta>
        | undefined;

      const fresh = getState();
      const syntheticId = forkSourceId
        ? forkAgentForVariant(dispatch, fresh, forkSourceId)
        : null;
      if (!syntheticId) continue;

      applyToolBundle(dispatch, syntheticId, {
        tools: entryMeta?.tools ?? [],
        customTools: entryMeta?.custom_tools ?? [],
        mcpServers: entryMeta?.mcp_servers ?? [],
      });

      try {
        await dispatch(
          createManualInstance({
            agentId: syntheticId,
            conversationId: entry.conversation_id,
            apiEndpointMode: "manual",
            sourceFeature: TOOLS_SOURCE_FEATURE,
          }),
        ).unwrap();
      } catch {
        dispatch(
          createInstance({
            conversationId: entry.conversation_id,
            agentId: syntheticId,
            agentType: "user",
            origin: "manual",
            sourceFeature: TOOLS_SOURCE_FEATURE,
          }),
        );
      }

      try {
        await dispatch(
          loadConversation({
            conversationId: entry.conversation_id,
            surfaceKey: TOOLS_SURFACE_KEY,
          }),
        ).unwrap();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[tools] loadConversation failed:", err);
      }

      nextColumns.push({
        columnId,
        conversationId: entry.conversation_id,
        syntheticAgentId: syntheticId,
        label: entryMeta?.label ?? `Variant ${nextColumns.length + 1}`,
        collapsed: false,
      });
    }

    dispatch(setToolsColumns(nextColumns));
    dispatch(setActiveToolsSet({ id: set.id, name: set.name }));
  },
);
