/**
 * Context State Slice
 *
 * One entry per conversation, holding "what the model is currently seeing":
 *   - last_request usage triple (input / cached / output tokens, REAL provider values)
 *   - rolled-up size of messages visible to the model (chars)
 *   - cache_state (provider, last_response_at, est_cache_ttl_secs, cumulative_trimmable_chars)
 *   - the last trim audit (TrimSummary — blocks_rewritten, freed_chars, policy snapshot)
 *   - raw provider usage block from the last cx_request (cache_creation, server_tool_use, ...)
 *
 * Sources of truth:
 *   - Live: CONTEXT_STATE / CONTEXT_TRIMMED stream events emitted by
 *     matrx_ai.db.persistence after each persisted turn.
 *   - Cold: GET /conversations/{id}/context-state on conversation open
 *     (initial hydration before the next stream fires).
 *
 * Wire-shape mirror of matrx_connect.context.events.ContextStatePayload —
 * keep field names identical so the slice can write the event payload
 * verbatim from process-stream.ts.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Mirror of the cx_conversation.cache_state JSONB shape written by
// matrx_ai/db/persistence.py::_refresh_cache_state.
export interface CacheState {
  last_response_at?: string;
  last_provider?: string;
  last_model?: string;
  last_cache_read_tokens?: number;
  est_cache_ttl_secs?: number;
  cumulative_trimmable_chars?: number;
  last_trim_at?: string;
  last_trim_freed_chars?: number;
}

// Mirror of TrimReport.to_dict() in matrx_ai/config/context_trim.py.
export interface TrimSummary {
  blocks_rewritten: number;
  freed_chars: number;
  before_total_chars: number;
  after_total_chars: number;
  rewritten_blocks: Array<{
    message_position: number;
    call_id: string;
    tool_name: string;
    before_chars: number;
    after_chars: number;
    positions_back: number;
    tier: string;
  }>;
  eligible_but_skipped_reason: string | null;
  policy: Record<string, unknown>;
}

export interface ContextStateEntry {
  conversationId: string;
  lastRequestInputTokens: number;
  lastRequestCachedTokens: number;
  lastRequestOutputTokens: number;
  totalCharsVisibleToModel: number;
  messageCountVisible: number;
  cacheState: CacheState;
  lastTrimSummary: TrimSummary | null;
  lastRawUsage: Record<string, unknown> | null;
  measuredAt: string | null;
}

export interface ContextStateSliceState {
  byConversationId: Record<string, ContextStateEntry>;
}

const initialState: ContextStateSliceState = {
  byConversationId: {},
};

function emptyEntry(conversationId: string): ContextStateEntry {
  return {
    conversationId,
    lastRequestInputTokens: 0,
    lastRequestCachedTokens: 0,
    lastRequestOutputTokens: 0,
    totalCharsVisibleToModel: 0,
    messageCountVisible: 0,
    cacheState: {},
    lastTrimSummary: null,
    lastRawUsage: null,
    measuredAt: null,
  };
}

// Payload shape received from the wire — snake_case mirrors the Python
// ContextStatePayload exactly so the stream thunk can hand it through
// without renaming each field.
export interface ContextStateWirePayload {
  conversation_id: string;
  last_request_input_tokens: number;
  last_request_cached_tokens: number;
  last_request_output_tokens: number;
  total_chars_visible_to_model: number;
  message_count_visible: number;
  cache_state: CacheState;
  measured_at: string;
  // From the GET /context-state hydration endpoint, not the stream event:
  last_trim_summary?: TrimSummary | null;
  last_raw_usage?: Record<string, unknown> | null;
}

export interface ContextTrimmedWirePayload {
  conversation_id: string;
  request_id: string | null;
  trim_summary: TrimSummary;
  measured_at: string;
}

const contextStateSlice = createSlice({
  name: "contextState",
  initialState,
  reducers: {
    /**
     * Apply a CONTEXT_STATE event (or initial-hydration response) to the
     * slice. Replaces the rolled-up fields; preserves lastTrimSummary +
     * lastRawUsage when the wire payload doesn't carry them (stream events
     * omit those; the hydration endpoint includes them).
     */
    applyContextState(
      state,
      action: PayloadAction<ContextStateWirePayload>,
    ) {
      const p = action.payload;
      const prior =
        state.byConversationId[p.conversation_id] ??
        emptyEntry(p.conversation_id);
      state.byConversationId[p.conversation_id] = {
        ...prior,
        conversationId: p.conversation_id,
        lastRequestInputTokens: p.last_request_input_tokens,
        lastRequestCachedTokens: p.last_request_cached_tokens,
        lastRequestOutputTokens: p.last_request_output_tokens,
        totalCharsVisibleToModel: p.total_chars_visible_to_model,
        messageCountVisible: p.message_count_visible,
        cacheState: p.cache_state ?? {},
        measuredAt: p.measured_at,
        lastTrimSummary:
          p.last_trim_summary !== undefined
            ? p.last_trim_summary
            : prior.lastTrimSummary,
        lastRawUsage:
          p.last_raw_usage !== undefined ? p.last_raw_usage : prior.lastRawUsage,
      };
    },

    /**
     * Apply a CONTEXT_TRIMMED event. Updates only the trim audit fields;
     * the rolled-up totals come from a CONTEXT_STATE event in the same
     * stream batch.
     */
    applyContextTrimmed(
      state,
      action: PayloadAction<ContextTrimmedWirePayload>,
    ) {
      const p = action.payload;
      const prior =
        state.byConversationId[p.conversation_id] ??
        emptyEntry(p.conversation_id);
      state.byConversationId[p.conversation_id] = {
        ...prior,
        lastTrimSummary: p.trim_summary,
      };
    },

    /** Clear context state for a conversation (used by reset / delete). */
    clearForConversation(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },
  },
});

export const {
  applyContextState,
  applyContextTrimmed,
  clearForConversation: clearContextStateForConversation,
} = contextStateSlice.actions;

export default contextStateSlice.reducer;
