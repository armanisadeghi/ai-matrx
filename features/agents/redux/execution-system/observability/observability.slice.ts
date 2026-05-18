/**
 * Observability Slice
 *
 * Runner-visible debug data, persisted across reload because it comes from
 * DB records (`cx_user_request`, `cx_request`, `cx_tool_call`) plus client
 * stream events (timeline, reservations).
 *
 * This slice is populated by:
 *   - The stream commit path — on `completion`, move from `activeRequests`
 *     into here (see Phase 2 commit logic).
 *   - `loadConversation` — rehydrates from `get_cx_conversation_bundle` RPC.
 *
 * Visibility is controlled at the selector/render layer via
 * `display.showCreatorDebug` (Chat hides it, Runner shows it). The data
 * lives here either way — visibility is purely a rendering concern.
 *
 * In Phase 1.4 this slice ships empty-but-ready. Phase 2 wires in the
 * population paths and drops the duplicate fields from `activeRequests/`.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  TimelineEntry,
  ReservationRecord,
} from "@/features/agents/types/request.types";
import type {
  Phase,
  WarningPayload,
  InfoPayload,
  CompletionPayload,
} from "@/types/python-generated/stream-events";
import type { Json } from "@/types/database.types";

// =============================================================================
// DB-faithful record shapes — mirror the Supabase Row types
// =============================================================================

/**
 * Mirrors `public.cx_user_request.Row`. One row per round-trip (user message
 * → assistant reply), regardless of how many internal LLM calls occurred.
 */
export interface CxUserRequestRecord {
  id: string;
  conversationId: string;
  userId: string;
  agentId: string | null;
  agentVersionId: string | null;
  status: string;
  iterations: number;
  finishReason: string | null;
  error: string | null;
  triggerMessagePosition: number | null;
  resultStartPosition: number | null;
  resultEndPosition: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalTokens: number;
  totalToolCalls: number;
  totalCost: number | null;
  totalDurationMs: number | null;
  apiDurationMs: number | null;
  toolDurationMs: number | null;
  sourceApp: string;
  sourceFeature: string;
  metadata: Json;
  createdAt: string;
  completedAt: string | null;
  deletedAt: string | null;
}

/** Mirrors `public.cx_request.Row`. One row per LLM provider call. */
export interface CxRequestRecord {
  id: string;
  conversationId: string;
  userRequestId: string;
  aiModelId: string;
  apiClass: string | null;
  iteration: number;
  responseId: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  cachedTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
  totalDurationMs: number | null;
  apiDurationMs: number | null;
  toolDurationMs: number | null;
  toolCallsCount: number | null;
  toolCallsDetails: Json | null;
  metadata: Json;
  createdAt: string;
  deletedAt: string | null;
}

/** Mirrors `public.cx_tool_call.Row`. One row per tool invocation. */
export interface CxToolCallRecord {
  id: string;
  conversationId: string;
  userRequestId: string | null;
  messageId: string | null;
  userId: string;
  callId: string;
  toolName: string;
  /**
   * What the AI literally called the tool (post-bundling alias). Null on
   * pre-migration rows and on freshly streamed rows where the executor hasn't
   * recorded the as-called name yet — display logic falls back to `toolName`
   * (the canonical) in those cases. Renderers always look themselves up by
   * `toolName`; `toolNameAsCalled` is for display + filtering only.
   */
  toolNameAsCalled: string | null;
  toolType: string;
  iteration: number;
  status: string;
  success: boolean;
  isError: boolean | null;
  errorType: string | null;
  errorMessage: string | null;
  arguments: Json;
  output: string | null;
  outputChars: number;
  outputPreview: Json | null;
  outputType: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  parentCallId: string | null;
  retryCount: number | null;
  persistKey: string | null;
  filePath: string | null;
  executionEvents: Json | null;
  metadata: Json;
  createdAt: string;
  deletedAt: string | null;
}

// =============================================================================
// Per-user-request transient state (live stream timeline)
// =============================================================================

export interface ObservabilityUserRequestTimeline {
  userRequestId: string;
  timeline: TimelineEntry[];
  phaseHistory: Phase[];
  warnings: WarningPayload[];
  infoEvents: InfoPayload[];
  completion: CompletionPayload | null;
}

// =============================================================================
// Slice state
// =============================================================================

export interface ObservabilityState {
  /** `cx_user_request` records, keyed by userRequestId. */
  userRequests: Record<string, CxUserRequestRecord>;
  /** Per-conversation ordered userRequestIds (oldest → newest). */
  userRequestsByConversationId: Record<string, string[]>;

  /** `cx_request` records (LLM provider calls), keyed by requestId. */
  requests: Record<string, CxRequestRecord>;
  /** userRequestId → child requestIds (in order of issue). */
  requestsByUserRequestId: Record<string, string[]>;

  /** `cx_tool_call` records, keyed by tool_call.id (UUID). */
  toolCalls: Record<string, CxToolCallRecord>;
  /** userRequestId → child toolCallIds (in order of issue). */
  toolCallsByUserRequestId: Record<string, string[]>;
  /**
   * Secondary index: callId (e.g. "gemini_-123...") → tool_call UUID.
   * Allows O(1) lookup when only the wire-format callId is known (e.g. when
   * building ToolLifecycleEntry from a persisted cx_message content block).
   */
  toolCallsByCallId: Record<string, string>;

  /** Live timelines, keyed by userRequestId. Survives stream end. */
  timelines: Record<string, ObservabilityUserRequestTimeline>;

  /**
   * Reservation rows (`record_reserved` / `record_update` stream events).
   * Keyed by reservation id (table + recordId composite). Retained after
   * completion for debug inspection.
   */
  reservations: Record<string, ReservationRecord>;
}

const initialState: ObservabilityState = {
  userRequests: {},
  userRequestsByConversationId: {},
  requests: {},
  requestsByUserRequestId: {},
  toolCalls: {},
  toolCallsByUserRequestId: {},
  toolCallsByCallId: {},
  timelines: {},
  reservations: {},
};

// =============================================================================
// Slice
// =============================================================================

const observabilitySlice = createSlice({
  name: "observability",
  initialState,
  reducers: {
    // ── cx_user_request ───────────────────────────────────────────────────────

    upsertUserRequest(state, action: PayloadAction<CxUserRequestRecord>) {
      const record = action.payload;
      state.userRequests[record.id] = record;
      const list =
        state.userRequestsByConversationId[record.conversationId] ?? [];
      if (!list.includes(record.id)) {
        list.push(record.id);
        state.userRequestsByConversationId[record.conversationId] = list;
      }
    },

    patchUserRequest(
      state,
      action: PayloadAction<{
        id: string;
        patch: Partial<CxUserRequestRecord>;
      }>,
    ) {
      const { id, patch } = action.payload;
      const existing = state.userRequests[id];
      if (!existing) return;
      state.userRequests[id] = { ...existing, ...patch };
    },

    // ── cx_request ────────────────────────────────────────────────────────────

    upsertRequest(state, action: PayloadAction<CxRequestRecord>) {
      const record = action.payload;
      state.requests[record.id] = record;
      const list = state.requestsByUserRequestId[record.userRequestId] ?? [];
      if (!list.includes(record.id)) {
        list.push(record.id);
        state.requestsByUserRequestId[record.userRequestId] = list;
      }
    },

    patchRequest(
      state,
      action: PayloadAction<{ id: string; patch: Partial<CxRequestRecord> }>,
    ) {
      const { id, patch } = action.payload;
      const existing = state.requests[id];
      if (!existing) return;
      state.requests[id] = { ...existing, ...patch };
    },

    // ── cx_tool_call ──────────────────────────────────────────────────────────

    upsertToolCall(state, action: PayloadAction<CxToolCallRecord>) {
      const record = action.payload;
      state.toolCalls[record.id] = record;
      state.toolCallsByCallId[record.callId] = record.id;
      if (record.userRequestId) {
        const list = state.toolCallsByUserRequestId[record.userRequestId] ?? [];
        if (!list.includes(record.id)) {
          list.push(record.id);
          state.toolCallsByUserRequestId[record.userRequestId] = list;
        }
      }
    },

    patchToolCall(
      state,
      action: PayloadAction<{ id: string; patch: Partial<CxToolCallRecord> }>,
    ) {
      const { id, patch } = action.payload;
      const existing = state.toolCalls[id];
      if (!existing) return;
      state.toolCalls[id] = { ...existing, ...patch };
    },

    // ── Timelines (per user-request) ──────────────────────────────────────────

    setTimeline(
      state,
      action: PayloadAction<ObservabilityUserRequestTimeline>,
    ) {
      state.timelines[action.payload.userRequestId] = action.payload;
    },

    appendTimelineEntry(
      state,
      action: PayloadAction<{ userRequestId: string; entry: TimelineEntry }>,
    ) {
      const { userRequestId, entry } = action.payload;
      const existing = state.timelines[userRequestId];
      if (existing) {
        existing.timeline.push(entry);
      } else {
        state.timelines[userRequestId] = {
          userRequestId,
          timeline: [entry],
          phaseHistory: [],
          warnings: [],
          infoEvents: [],
          completion: null,
        };
      }
    },

    // ── Reservations ──────────────────────────────────────────────────────────

    upsertReservation(state, action: PayloadAction<ReservationRecord>) {
      state.reservations[action.payload.recordId] = action.payload;
    },

    // ── Bulk hydration ────────────────────────────────────────────────────────

    /**
     * Additive merge of tool-call rows. Used by `loadOlderMessages` when
     * paging older conversation history in: the bundle's `tool_calls` are
     * joined to the older page's `message_id`s and must be merged WITHOUT
     * touching any tool_call already in state (which may be live-streaming).
     *
     * Rules:
     *   - Skip every id already present in `byId` — never overwrite.
     *   - Populate `toolCallsByCallId` for new ids only.
     *   - Append to `toolCallsByUserRequestId` only when a userRequestId is
     *     present and the id isn't already in that list.
     */
    mergeToolCalls(
      state,
      action: PayloadAction<{ toolCalls: CxToolCallRecord[] }>,
    ) {
      const { toolCalls } = action.payload;
      for (const record of toolCalls) {
        if (state.toolCalls[record.id]) continue;
        state.toolCalls[record.id] = record;
        if (record.callId && !state.toolCallsByCallId[record.callId]) {
          state.toolCallsByCallId[record.callId] = record.id;
        }
        if (record.userRequestId) {
          const list =
            state.toolCallsByUserRequestId[record.userRequestId] ?? [];
          if (!list.includes(record.id)) {
            list.push(record.id);
            state.toolCallsByUserRequestId[record.userRequestId] = list;
          }
        }
      }
    },

    /**
     * Populate observability from `get_cx_conversation_bundle` RPC result.
     * Used by `loadConversation` (Phase 2).
     */
    hydrateObservability(
      state,
      action: PayloadAction<{
        conversationId: string;
        userRequests: CxUserRequestRecord[];
        requests: CxRequestRecord[];
        toolCalls: CxToolCallRecord[];
      }>,
    ) {
      const { conversationId, userRequests, requests, toolCalls } =
        action.payload;

      // user requests
      const userRequestIds: string[] = [];
      for (const ur of userRequests) {
        state.userRequests[ur.id] = ur;
        userRequestIds.push(ur.id);
      }
      state.userRequestsByConversationId[conversationId] = userRequestIds;

      // requests grouped by userRequestId
      const requestGroups: Record<string, string[]> = {};
      for (const r of requests) {
        state.requests[r.id] = r;
        (requestGroups[r.userRequestId] ??= []).push(r.id);
      }
      for (const [urid, ids] of Object.entries(requestGroups)) {
        state.requestsByUserRequestId[urid] = ids;
      }

      // tool calls grouped by userRequestId; also populate callId secondary index
      const toolGroups: Record<string, string[]> = {};
      for (const tc of toolCalls) {
        state.toolCalls[tc.id] = tc;
        state.toolCallsByCallId[tc.callId] = tc.id;
        if (tc.userRequestId) {
          (toolGroups[tc.userRequestId] ??= []).push(tc.id);
        }
      }
      for (const [urid, ids] of Object.entries(toolGroups)) {
        state.toolCallsByUserRequestId[urid] = ids;
      }
    },

    /** Clear all observability data for a conversation. */
    clearForConversation(state, action: PayloadAction<string>) {
      const conversationId = action.payload;
      const userRequestIds =
        state.userRequestsByConversationId[conversationId] ?? [];
      for (const urid of userRequestIds) {
        delete state.userRequests[urid];
        const reqIds = state.requestsByUserRequestId[urid] ?? [];
        for (const rid of reqIds) delete state.requests[rid];
        delete state.requestsByUserRequestId[urid];
        const toolIds = state.toolCallsByUserRequestId[urid] ?? [];
        for (const tid of toolIds) {
          const tc = state.toolCalls[tid];
          if (tc) delete state.toolCallsByCallId[tc.callId];
          delete state.toolCalls[tid];
        }
        delete state.toolCallsByUserRequestId[urid];
        delete state.timelines[urid];
      }
      delete state.userRequestsByConversationId[conversationId];
    },
  },
});

export const {
  upsertUserRequest,
  patchUserRequest,
  upsertRequest,
  patchRequest,
  upsertToolCall,
  patchToolCall,
  setTimeline,
  appendTimelineEntry,
  upsertReservation,
  mergeToolCalls,
  hydrateObservability,
  clearForConversation,
} = observabilitySlice.actions;

export default observabilitySlice.reducer;
