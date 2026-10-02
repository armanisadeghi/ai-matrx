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

// Wire payloads — snake_case, JSONB-shaped fields typed as
// Record<string, unknown> so the slice's actions accept the generated
// ContextStatePayload / ContextTrimmedPayload from stream-events.ts
// verbatim (no cast at the dispatch site). The reducer narrows the
// runtime values to typed CacheState / TrimSummary at entry.
//
// Two separate shapes because the stream event NEVER carries
// last_trim_summary / last_raw_usage (those come from the GET
// /context-state hydration endpoint only). Making them optional on a
// shared type breaks assignability under exactOptionalPropertyTypes —
// keep the two distinct so each action's PayloadAction matches its
// real source exactly.
// Matches the generated stream-events.ts ContextStatePayload exactly —
// pydantic int-with-default fields come out as optional. Optionality is
// preserved here so direct assignment from a stream event compiles
// without casts.
export interface ContextStateWirePayload {
  conversation_id: string;
  last_request_input_tokens?: number;
  last_request_cached_tokens?: number;
  last_request_output_tokens?: number;
  total_chars_visible_to_model?: number;
  message_count_visible?: number;
  cache_state?: Record<string, unknown>;
  measured_at: string;
}

export interface ContextStateHydrationPayload extends ContextStateWirePayload {
  last_trim_summary: Record<string, unknown> | null;
  last_raw_usage: Record<string, unknown> | null;
}

// Matches stream-events.ts ContextTrimmedPayload — request_id is optional
// because ``request_id: str | None`` lands as ``?: string | null`` in the
// generated TS.
export interface ContextTrimmedWirePayload {
  conversation_id: string;
  request_id?: string | null;
  trim_summary: Record<string, unknown>;
  measured_at: string;
}

const contextStateSlice = createSlice({
  name: "contextState",
  initialState,
  reducers: {
    /**
     * Apply a CONTEXT_STATE stream event. Preserves prior lastTrimSummary +
     * lastRawUsage — the stream event never carries those, only the
     * hydration endpoint does (see ``hydrateContextState`` below).
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
        // Wire payload fields are optional (pydantic int-with-default →
        // generated TS optional) — coalesce to 0 here so the slice's typed
        // shape stays non-optional and consumers don't need to null-check.
        lastRequestInputTokens: p.last_request_input_tokens ?? 0,
        lastRequestCachedTokens: p.last_request_cached_tokens ?? 0,
        lastRequestOutputTokens: p.last_request_output_tokens ?? 0,
        totalCharsVisibleToModel: p.total_chars_visible_to_model ?? 0,
        messageCountVisible: p.message_count_visible ?? 0,
        // Narrow wire-shape Record<string, unknown> → CacheState. The
        // CacheState interface has only optional fields so unknown extras
        // don't break anything — they just don't get a typed accessor.
        cacheState: (p.cache_state ?? {}) as CacheState,
        measuredAt: p.measured_at,
      };
    },

    /**
     * Apply the cold-start hydration response (GET /context-state).
     * Same as applyContextState plus populates lastTrimSummary and
     * lastRawUsage from the response body.
     */
    hydrateContextState(
      state,
      action: PayloadAction<ContextStateHydrationPayload>,
    ) {
      const p = action.payload;
      const prior =
        state.byConversationId[p.conversation_id] ??
        emptyEntry(p.conversation_id);
      state.byConversationId[p.conversation_id] = {
        ...prior,
        conversationId: p.conversation_id,
        lastRequestInputTokens: p.last_request_input_tokens ?? 0,
        lastRequestCachedTokens: p.last_request_cached_tokens ?? 0,
        lastRequestOutputTokens: p.last_request_output_tokens ?? 0,
        totalCharsVisibleToModel: p.total_chars_visible_to_model ?? 0,
        messageCountVisible: p.message_count_visible ?? 0,
        cacheState: (p.cache_state ?? {}) as CacheState,
        measuredAt: p.measured_at,
        lastTrimSummary: p.last_trim_summary as TrimSummary | null,
        lastRawUsage: p.last_raw_usage,
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
        // Wire shape is Record<string, unknown>; the runtime contents match
        // TrimSummary (matrx_ai writes to_dict() of the TrimReport dataclass).
        // TrimSummary has required fields, so it doesn't structurally overlap
        // with Record<string, unknown> enough for a direct cast — narrow via
        // `unknown` at the slice boundary; selectors can read typed fields
        // off it from here on.
        lastTrimSummary: p.trim_summary as unknown as TrimSummary,
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
  hydrateContextState,
  applyContextTrimmed,
  clearForConversation: clearContextStateForConversation,
} = contextStateSlice.actions;

export default contextStateSlice.reducer;
