/**
 * System-Prompt-mode thunks.
 *
 * Locked across columns: agent (source) + version + variables + user
 * message + tools + LLM settings. Varied per column: the system prompt
 * text. Each column owns a SYNTHETIC clone of the locked agent — a
 * `cmp-<uuid>` AgentDefinition record kept entirely in Redux. The
 * column's manual instance is keyed to that synthetic id so when the
 * execute-manual-instance thunk reads
 * `state.agentDefinition.agents[sourceId]`, it sees the per-column
 * system-message edits naturally.
 *
 * Why manual (not agent) endpoint? The Agent Builder's manual API path
 * pushes the full agent definition with each request — that's exactly
 * what lets us vary per column without ever persisting a "false agent"
 * back to the DB. The `cmp-` id prefix gates save thunks from ever
 * uploading these.
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
  setAgentMessages,
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
import { forkAgentForVariant } from "@/features/agent-comparison/shared/forkAgentForVariant";
import { isSyntheticAgentId } from "@/features/agents/redux/agent-definition/synthetic-id";
import type { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";
import {
  addSystemPromptColumn,
  removeSystemPromptColumn,
  replaceSystemPromptColumn,
  resetSystemPrompt,
  setActiveSystemPromptSet,
  setLocked,
  setSystemPromptColumns,
  submitAllFinished,
  submitAllStarted,
} from "./slice";
import type { SystemPromptColumn } from "../types";

// =============================================================================
// Page-wide constants
// =============================================================================

export const SYSTEM_PROMPT_SURFACE_KEY = "agent-comparison-system-prompt";
const SYSTEM_PROMPT_SOURCE_FEATURE = "agent-comparison" as const;

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

// =============================================================================
// Synthetic-agent helpers
// =============================================================================

/**
 * Read the current system-message text out of a synthetic agent's
 * messages array. Returns "" when no system message exists. Used at
 * save time so the loader can rebuild each column with the same prompt.
 */
function extractSystemText(state: RootState, agentId: string): string {
  const agent = state.agentDefinition.agents?.[agentId];
  if (!agent?.messages) return "";
  const sys = agent.messages.find((m) => m.role === "system");
  if (!sys) return "";
  const textBlock = (sys.content as Array<{ type?: string; text?: string }>)
    .find((b) => b?.type === "text");
  return textBlock?.text ?? "";
}

/**
 * Write a system-message text into a synthetic agent, preserving any
 * non-text blocks already present and preserving non-system messages.
 * Mirrors the write-back shape used by `SystemMessage.tsx` so the same
 * editor component can drive these synthetics with no special casing.
 */
function writeSystemText(
  dispatch: AppDispatch,
  state: RootState,
  agentId: string,
  text: string,
) {
  const agent = state.agentDefinition.agents?.[agentId];
  if (!agent) return;
  const allMessages = agent.messages ?? [];
  const nonSystem = allMessages.filter((m) => m.role !== "system");
  const existingSystem = allMessages.find((m) => m.role === "system");
  const existingNonTextBlocks = existingSystem
    ? (existingSystem.content as Array<{ type?: string }>).filter(
        (b) => b?.type !== "text",
      )
    : [];

  const newContent = text.trim()
    ? [
        { type: "text" as const, text },
        ...(existingNonTextBlocks as unknown as AgentDefinitionMessage["content"]),
      ]
    : (existingNonTextBlocks as unknown as AgentDefinitionMessage["content"]);

  const updated: AgentDefinitionMessage[] =
    newContent.length > 0
      ? [{ role: "system", content: newContent }, ...nonSystem]
      : nonSystem;

  dispatch(setAgentMessages({ id: agentId, messages: updated }));
}

/**
 * Tear down a column: destroy the instance, remove its synthetic agent
 * record from agentDefinition.agents (saves are gated by the cmp-
 * prefix so leaving it would be harmless but wasteful), and drop the
 * slice entry.
 */
function teardownColumn(
  dispatch: AppDispatch,
  col: SystemPromptColumn,
) {
  dispatch(destroyInstance(col.conversationId));
  if (isSyntheticAgentId(col.syntheticAgentId)) {
    dispatch(removeAgent(col.syntheticAgentId));
  }
}

// =============================================================================
// Locked-axis configuration
// =============================================================================

/**
 * Set the locked source agent. Recreates every existing column with a
 * fresh synthetic clone of the new source — old per-column system-prompt
 * edits drop, which is the expected behavior (a new source agent is a
 * new baseline).
 */
export const setLockedSourceAgent = createAsyncThunk<
  void,
  { agentId: string },
  ThunkApi
>(
  "agentComparisonSystemPrompt/setLockedSourceAgent",
  async ({ agentId }, { dispatch, getState }) => {
    const state = getState();
    const prev = state.agentComparisonSystemPrompt.locked;
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
    // source agent. We do NOT carry over the old system-prompt edits;
    // the source agent's baseline is the right starting point and the
    // user can edit each column from there.
    const post = getState();
    for (const col of post.agentComparisonSystemPrompt.columns) {
      teardownColumn(dispatch, col);
      const syntheticId = forkAgentForVariant(dispatch, post, agentId);
      if (!syntheticId) continue;
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: syntheticId,
          conversationId,
          apiEndpointMode: "manual",
          sourceFeature: SYSTEM_PROMPT_SOURCE_FEATURE,
        }),
      ).unwrap();
      dispatch(
        replaceSystemPromptColumn({
          columnId: col.columnId,
          next: { conversationId, syntheticAgentId: syntheticId },
        }),
      );
    }
  },
);

/**
 * Pin a version on the locked source agent. Forks each column from the
 * pinned snapshot record (so the synthetic carries the version's
 * messages/settings/tools, not the agent's current head).
 */
export const setLockedVersion = createAsyncThunk<
  void,
  { version: "current" | number; versionId?: string },
  ThunkApi
>(
  "agentComparisonSystemPrompt/setLockedVersion",
  async ({ version, versionId }, { dispatch, getState }) => {
    const state = getState();
    const { sourceAgentId, agentVersion } =
      state.agentComparisonSystemPrompt.locked;
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

    // The fork source is the version record when pinned, the source
    // agent when "current". The fork helper looks up by id in
    // agentDefinition.agents, which is keyed by either depending on what
    // was loaded.
    const post = getState();
    const forkSourceId =
      version === "current"
        ? sourceAgentId
        : versionId ?? sourceAgentId;

    for (const col of post.agentComparisonSystemPrompt.columns) {
      teardownColumn(dispatch, col);
      const syntheticId = forkAgentForVariant(dispatch, post, forkSourceId);
      if (!syntheticId) continue;
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: syntheticId,
          conversationId,
          apiEndpointMode: "manual",
          sourceFeature: SYSTEM_PROMPT_SOURCE_FEATURE,
        }),
      ).unwrap();
      dispatch(
        replaceSystemPromptColumn({
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

export const addColumnToSystemPromptBattle = createAsyncThunk<
  string | null,
  { label?: string } | undefined,
  ThunkApi
>(
  "agentComparisonSystemPrompt/addColumn",
  async (arg, { dispatch, getState }) => {
    const state = getState();
    const { sourceAgentId, agentVersion, agentVersionId } =
      state.agentComparisonSystemPrompt.locked;
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
      `Variant ${state.agentComparisonSystemPrompt.columns.length + 1}`;

    await dispatch(
      createManualInstance({
        agentId: syntheticId,
        conversationId,
        apiEndpointMode: "manual",
        sourceFeature: SYSTEM_PROMPT_SOURCE_FEATURE,
      }),
    ).unwrap();

    dispatch(
      addSystemPromptColumn({
        columnId,
        conversationId,
        syntheticAgentId: syntheticId,
        label,
      }),
    );
    return columnId;
  },
);

export const removeColumnFromSystemPromptBattle = createAsyncThunk<
  void,
  { columnId: string },
  ThunkApi
>(
  "agentComparisonSystemPrompt/removeColumn",
  async ({ columnId }, { dispatch, getState }) => {
    const state = getState();
    const col = state.agentComparisonSystemPrompt.columns.find(
      (c) => c.columnId === columnId,
    );
    if (col) teardownColumn(dispatch, col);
    dispatch(removeSystemPromptColumn({ columnId }));
  },
);

// =============================================================================
// Submit All
// =============================================================================

export const submitAllSystemPrompt = createAsyncThunk<
  { launched: number; failed: number; skipped: number },
  void,
  ThunkApi
>(
  "agentComparisonSystemPrompt/submitAll",
  async (_arg, { dispatch, getState }) => {
    dispatch(submitAllStarted());
    try {
      const state = getState();
      const { sourceAgentId, variables, userMessage } =
        state.agentComparisonSystemPrompt.locked;
      const columns = state.agentComparisonSystemPrompt.columns;

      if (!sourceAgentId || columns.length === 0) {
        return { launched: 0, failed: 0, skipped: columns.length };
      }

      // Locked-input page — broadcast the locked text + variables to
      // every column's per-instance slices before firing.
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
              surfaceKey: SYSTEM_PROMPT_SURFACE_KEY,
            }),
          ).unwrap(),
        ),
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      const launched = results.length - failed;

      const post = getState();
      const activeSetId = post.agentComparisonSystemPrompt.activeSetId;
      if (activeSetId) {
        const entries = buildSystemPromptEntries(post);
        try {
          await replaceEntries(activeSetId, entries);
          await renameComparisonSet(
            activeSetId,
            post.agentComparisonSystemPrompt.activeSetName ??
              "Untitled comparison",
          );
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            "[system-prompt] failed to persist comparison entries:",
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

export const clearSystemPromptBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonSystemPrompt/clear",
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    for (const col of state.agentComparisonSystemPrompt.columns) {
      teardownColumn(dispatch, col);
    }
    dispatch(resetSystemPrompt());
  },
);

/**
 * Reset every column's conversation. preserveInputs=true keeps each
 * column's current per-column system-prompt edits; false resets every
 * column back to the source agent's baseline prompt.
 */
export const resetAllSystemPromptConversations = createAsyncThunk<
  void,
  { preserveInputs?: boolean } | undefined,
  ThunkApi
>(
  "agentComparisonSystemPrompt/resetAllConversations",
  async (arg, { dispatch, getState }) => {
    const preserveInputs = arg?.preserveInputs ?? true;
    const state = getState();
    const { sourceAgentId, agentVersion, agentVersionId } =
      state.agentComparisonSystemPrompt.locked;
    if (!sourceAgentId) return;

    const forkSourceId =
      agentVersion === "current" || !agentVersionId
        ? sourceAgentId
        : agentVersionId;

    for (const col of state.agentComparisonSystemPrompt.columns) {
      const savedSystemText = preserveInputs
        ? extractSystemText(state, col.syntheticAgentId)
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
          sourceFeature: SYSTEM_PROMPT_SOURCE_FEATURE,
        }),
      ).unwrap();
      if (savedSystemText !== null) {
        writeSystemText(dispatch, getState(), syntheticId, savedSystemText);
      }
      dispatch(
        replaceSystemPromptColumn({
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

interface PersistedSystemPromptEntryMeta {
  label: string;
  system_message: string;
}

function buildSystemPromptEntries(state: RootState): UpsertEntryInput[] {
  const out: UpsertEntryInput[] = [];
  const { sourceAgentId, agentVersion, agentVersionId } =
    state.agentComparisonSystemPrompt.locked;
  if (!sourceAgentId) return out;
  state.agentComparisonSystemPrompt.columns.forEach((col, idx) => {
    const meta: PersistedSystemPromptEntryMeta = {
      label: col.label,
      system_message: extractSystemText(state, col.syntheticAgentId),
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
  } = state.agentComparisonSystemPrompt.locked;
  return {
    mode: "system-prompt",
    locked: {
      source_agent_id: sourceAgentId,
      agent_version: agentVersion,
      agent_version_id: agentVersionId,
      variables,
      user_message: userMessage,
    },
  };
}

export const saveSystemPromptBattleAs = createAsyncThunk<
  { id: string; name: string },
  { name: string },
  ThunkApi
>(
  "agentComparisonSystemPrompt/saveAs",
  async ({ name }, { dispatch, getState }) => {
    const state = getState();
    const userId = selectUserId(state);
    if (!userId) throw new Error("Not signed in");

    const set = await createComparisonSet({
      name,
      userId,
      metadata: buildSetMetadata(state),
    });
    const entries = buildSystemPromptEntries(state);
    if (entries.length > 0) {
      await replaceEntries(set.id, entries);
    }
    dispatch(setActiveSystemPromptSet({ id: set.id, name: set.name }));
    return { id: set.id, name: set.name };
  },
);

export const saveSystemPromptBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonSystemPrompt/save",
  async (_arg, { getState }) => {
    const state = getState();
    const setId = state.agentComparisonSystemPrompt.activeSetId;
    if (!setId) throw new Error("No active comparison set");
    const entries = buildSystemPromptEntries(state);
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

export const loadSystemPromptBattleSet = createAsyncThunk<
  void,
  { setId: string },
  ThunkApi
>(
  "agentComparisonSystemPrompt/loadSet",
  async ({ setId }, { dispatch, getState }) => {
    const before = getState();
    for (const col of before.agentComparisonSystemPrompt.columns) {
      teardownColumn(dispatch, col);
    }
    dispatch(resetSystemPrompt());

    const { set, entries } = await loadComparisonSet(setId);
    const meta = (set.metadata ?? {}) as {
      mode?: string;
      locked?: LoadedLockedSpec;
    };
    if (meta.mode !== "system-prompt") {
      throw new Error(
        `Comparison set "${set.name}" is not a system-prompt-mode set (mode=${meta.mode ?? "?"})`,
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

    const nextColumns: SystemPromptColumn[] = [];
    for (const entry of entries) {
      const columnId = crypto.randomUUID();
      const entryMeta = (entry.metadata ?? {}) as
        | Partial<PersistedSystemPromptEntryMeta>
        | undefined;

      const fresh = getState();
      const syntheticId = forkSourceId
        ? forkAgentForVariant(dispatch, fresh, forkSourceId)
        : null;
      if (!syntheticId) continue;

      if (entryMeta?.system_message) {
        writeSystemText(
          dispatch,
          getState(),
          syntheticId,
          entryMeta.system_message,
        );
      }

      try {
        await dispatch(
          createManualInstance({
            agentId: syntheticId,
            conversationId: entry.conversation_id,
            apiEndpointMode: "manual",
            sourceFeature: SYSTEM_PROMPT_SOURCE_FEATURE,
          }),
        ).unwrap();
      } catch {
        dispatch(
          createInstance({
            conversationId: entry.conversation_id,
            agentId: syntheticId,
            agentType: "user",
            origin: "manual",
            sourceFeature: SYSTEM_PROMPT_SOURCE_FEATURE,
          }),
        );
      }

      try {
        await dispatch(
          loadConversation({
            conversationId: entry.conversation_id,
            surfaceKey: SYSTEM_PROMPT_SURFACE_KEY,
          }),
        ).unwrap();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[system-prompt] loadConversation failed:", err);
      }

      nextColumns.push({
        columnId,
        conversationId: entry.conversation_id,
        syntheticAgentId: syntheticId,
        label: entryMeta?.label ?? `Variant ${nextColumns.length + 1}`,
        collapsed: false,
      });
    }

    dispatch(setSystemPromptColumns(nextColumns));
    dispatch(setActiveSystemPromptSet({ id: set.id, name: set.name }));
  },
);
