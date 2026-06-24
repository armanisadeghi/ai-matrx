/**
 * Conversations Slice
 *
 * The shell entity for each agent conversation (formerly "execution instance").
 * Keyed by conversationId — a plain UUID that doubles as the server-side
 * conversation thread identifier.
 *
 * This slice manages conversation lifecycle (create → ready → running → complete)
 * but delegates all content (messages, variables, overrides, …) to sibling
 * slices under `execution-system/`.
 *
 * Historical note: this was previously named `conversations` and the
 * record type was `Conversation`. The rename unifies the vocabulary with
 * the agent-system mental model, where every interaction (Chat, Runner,
 * Shortcut, App) maps onto a single `Conversation` entity.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ExecutionInstance,
  InstanceStatus,
  InstanceOrigin,
  SourceFeature,
} from "@/features/agents/types/instance.types";
import { SOURCE_APP } from "@/features/agents/types/instance.types";
import { generateConversationId } from "../utils/ids";
import { AgentType } from "@/features/agents/types/agent-definition.types";
import type { ApiEndpointMode } from "@/features/agents/types/instance.types";
import { createInstanceFull } from "../create-instance-full";

// =============================================================================
// Record alias
//
// The Phase 1.1 rename keeps the underlying shape (`ExecutionInstance`) so
// consumers don't need to retype. Phase 1.2 extends ConversationRecord with
// sidebar fields (title, description, keywords, scope ids, isEphemeral, ...).
// =============================================================================

export type ConversationRecord = ExecutionInstance;

// =============================================================================
// State
// =============================================================================

export interface ConversationsState {
  byConversationId: Record<string, ConversationRecord>;
  allConversationIds: string[];
  /**
   * When true, destroyInstance and destroyInstancesForAgent are no-ops. Flip
   * via setDebugSession(true) to preserve all conversation + request data for
   * the rest of the session (debug panel, agents/build, agents/run).
   */
  debugSessionActive: boolean;
}

const initialState: ConversationsState = {
  byConversationId: {},
  allConversationIds: [],
  debugSessionActive: false,
};

// =============================================================================
// Shared record builder — the ONE place a ConversationRecord shell is created.
// Used by both the `createInstance` reducer and the `createInstanceFull`
// extraReducer so the two creation paths can never drift.
// =============================================================================

interface CreateInstanceArgs {
  conversationId?: string;
  agentId: string;
  agentType: AgentType;
  origin: InstanceOrigin;
  shortcutId?: string;
  status?: InstanceStatus;
  sourceFeature?: SourceFeature;
  // New ConversationInvocation / cx_conversation fields (all optional)
  surfaceKey?: string;
  initialAgentId?: string | null;
  initialAgentVersionId?: string | null;
  parentConversationId?: string | null;
  forkedFromId?: string | null;
  forkedAtPosition?: number | null;
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  isEphemeral?: boolean;
  isPublic?: boolean;
  apiEndpointMode?: ApiEndpointMode;
  reuseConversationId?: boolean;
  builderAdvancedSettings?: ConversationRecord["builderAdvancedSettings"];
  metadata?: Record<string, unknown>;
}

function applyCreateInstance(
  state: ConversationsState,
  payload: CreateInstanceArgs,
): void {
  const {
    conversationId = generateConversationId(),
    agentId,
    agentType,
    origin,
    shortcutId = null,
    status = "draft",
    sourceFeature = "agent-runner",
    surfaceKey,
    initialAgentId,
    initialAgentVersionId,
    parentConversationId,
    forkedFromId,
    forkedAtPosition,
    organizationId,
    projectId,
    taskId,
    isEphemeral,
    isPublic,
    apiEndpointMode,
    reuseConversationId,
    builderAdvancedSettings,
    metadata,
  } = payload;

  const now = new Date().toISOString();

  state.byConversationId[conversationId] = {
    // Legacy surface
    conversationId,
    agentId,
    agentType,
    origin,
    shortcutId,
    status,
    sourceApp: SOURCE_APP,
    sourceFeature,
    cacheOnly: true,
    createdAt: now,
    updatedAt: now,
    // Invocation-derived fields (only stamp when provided so the
    // payload shape stays minimal for unchanged call sites)
    ...(surfaceKey !== undefined ? { surfaceKey } : {}),
    ...(initialAgentId !== undefined
      ? { initialAgentId }
      : { initialAgentId: agentId }),
    ...(initialAgentVersionId !== undefined ? { initialAgentVersionId } : {}),
    ...(parentConversationId !== undefined ? { parentConversationId } : {}),
    ...(forkedFromId !== undefined ? { forkedFromId } : {}),
    ...(forkedAtPosition !== undefined ? { forkedAtPosition } : {}),
    ...(organizationId !== undefined ? { organizationId } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
    ...(isEphemeral !== undefined ? { isEphemeral } : {}),
    ...(isPublic !== undefined ? { isPublic } : {}),
    ...(apiEndpointMode !== undefined ? { apiEndpointMode } : {}),
    ...(reuseConversationId !== undefined ? { reuseConversationId } : {}),
    ...(builderAdvancedSettings !== undefined
      ? { builderAdvancedSettings }
      : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
  state.allConversationIds.push(conversationId);
}

// =============================================================================
// Slice
// =============================================================================

const conversationsSlice = createSlice({
  name: "conversations",
  initialState,
  reducers: {
    createInstance(state, action: PayloadAction<CreateInstanceArgs>) {
      applyCreateInstance(state, action.payload);
    },

    setInstanceStatus(
      state,
      action: PayloadAction<{
        conversationId: string;
        status: InstanceStatus;
      }>,
    ) {
      const { conversationId, status } = action.payload;
      const instance = state.byConversationId[conversationId];
      if (instance) {
        instance.status = status;
        instance.updatedAt = new Date().toISOString();
      }
    },

    /** Mark a conversation as server-confirmed (no longer cache-only). */
    confirmServerSync(state, action: PayloadAction<string>) {
      const instance = state.byConversationId[action.payload];
      if (instance) {
        instance.cacheOnly = false;
      }
    },

    /**
     * Applies the `data.conversation_labeled` stream event — server-generated
     * title/description/keywords arrive mid-stream after the first assistant
     * turn completes. Also used by `loadConversation` rehydration.
     */
    setConversationLabel(
      state,
      action: PayloadAction<{
        conversationId: string;
        title?: string | null;
        description?: string | null;
        keywords?: string[] | null;
      }>,
    ) {
      const { conversationId, title, description, keywords } = action.payload;
      const instance = state.byConversationId[conversationId];
      if (!instance) return;
      if (title !== undefined) instance.title = title;
      if (description !== undefined) instance.description = description;
      if (keywords !== undefined) instance.keywords = keywords;
      instance.updatedAt = new Date().toISOString();
    },

    /**
     * Generic partial update — used by the upcoming `loadConversation` thunk
     * and the stream router for arbitrary field updates. Always preserves
     * `conversationId` so callers cannot accidentally rekey a record.
     */
    patchConversation(
      state,
      action: PayloadAction<
        { conversationId: string } & Partial<ConversationRecord>
      >,
    ) {
      const { conversationId, ...patch } = action.payload;
      const instance = state.byConversationId[conversationId];
      if (!instance) return;
      Object.assign(instance, patch);
      instance.conversationId = conversationId;
      instance.updatedAt = new Date().toISOString();
    },

    /**
     * Rehydrate (or create) a conversation record from a DB-shaped payload.
     * Expected to be called by `loadConversation` after the
     * `get_cx_conversation_bundle` RPC returns. If the record already exists,
     * fields are merged; if not, a new entry is created.
     */
    hydrateConversation(
      state,
      action: PayloadAction<
        { conversationId: string } & Partial<ConversationRecord>
      >,
    ) {
      const { conversationId } = action.payload;
      const existing = state.byConversationId[conversationId];
      if (existing) {
        Object.assign(existing, action.payload);
        existing.conversationId = conversationId;
        existing.cacheOnly = false;
      } else {
        // Seed a skeleton record — caller should provide enough fields to
        // satisfy the legacy surface (agentId, agentType, origin). Missing
        // fields fall back to sensible defaults so downstream selectors
        // continue to work.
        const now = new Date().toISOString();
        state.byConversationId[conversationId] = {
          conversationId,
          agentId:
            (action.payload.agentId as string | undefined) ??
            (action.payload.initialAgentId as string | undefined) ??
            "",
          agentType: action.payload.agentType ?? "user",
          origin: action.payload.origin ?? "manual",
          shortcutId: action.payload.shortcutId ?? null,
          status: action.payload.status ?? "ready",
          sourceApp: action.payload.sourceApp ?? SOURCE_APP,
          sourceFeature:
            action.payload.sourceFeature ?? ("agent-runner" as SourceFeature),
          cacheOnly: false,
          createdAt: action.payload.createdAt ?? now,
          updatedAt: action.payload.updatedAt ?? now,
          ...action.payload,
        } as ConversationRecord;
        state.allConversationIds.push(conversationId);
      }
    },

    /**
     * Enable or disable debug-session mode.
     * While active, destroyInstance and destroyInstancesForAgent are no-ops so
     * all conversation + request data is retained for the debug panel. Once
     * set to true it is intentionally never reset to false for the session.
     */
    setDebugSession(state, action: PayloadAction<boolean>) {
      state.debugSessionActive = action.payload;
    },

    /**
     * Remove a conversation and free its ID.
     * Sibling slices clean up via extraReducers on this action.
     * No-op when debugSessionActive is true.
     */
    destroyInstance(state, action: PayloadAction<string>) {
      if (state.debugSessionActive) return;
      const conversationId = action.payload;
      delete state.byConversationId[conversationId];
      state.allConversationIds = state.allConversationIds.filter(
        (id) => id !== conversationId,
      );
    },

    destroyInstancesForAgent(state, action: PayloadAction<string>) {
      if (state.debugSessionActive) return;
      const agentId = action.payload;
      const toRemove = state.allConversationIds.filter(
        (id) => state.byConversationId[id]?.agentId === agentId,
      );
      for (const id of toRemove) {
        delete state.byConversationId[id];
      }
      state.allConversationIds = state.allConversationIds.filter(
        (id) => !toRemove.includes(id),
      );
    },
  },
  extraReducers: (builder) => {
    // Atomic creation: build the conversation record shell from the unified
    // createInstanceFull action (same helper as the createInstance reducer).
    builder.addCase(createInstanceFull, (state, action) => {
      const p = action.payload;
      applyCreateInstance(state, {
        conversationId: p.conversationId,
        agentId: p.agentId,
        agentType: p.agentType,
        origin: p.origin,
        sourceFeature: p.sourceFeature,
        shortcutId: p.shortcutId,
        initialAgentVersionId: p.initialAgentVersionId,
        isEphemeral: p.isEphemeral,
      });
    });

    // When messages are hydrated from the database (reload path), the
    // conversation is by definition already persisted server-side — flip
    // cacheOnly off so selectors that gate on server confirmation (URL nav,
    // sidebar highlight) see the conversation as ready. Action type is
    // matched by string to avoid a circular import with messages.slice.
    builder.addMatcher(
      (action): action is PayloadAction<{ conversationId: string }> =>
        (action as { type?: string }).type === "messages/hydrateMessages",
      (state, action) => {
        const instance = state.byConversationId[action.payload.conversationId];
        if (instance) instance.cacheOnly = false;
      },
    );
  },
});

export const {
  createInstance,
  setInstanceStatus,
  confirmServerSync,
  setConversationLabel,
  patchConversation,
  hydrateConversation,
  setDebugSession,
  destroyInstance,
  destroyInstancesForAgent,
} = conversationsSlice.actions;

export default conversationsSlice.reducer;
