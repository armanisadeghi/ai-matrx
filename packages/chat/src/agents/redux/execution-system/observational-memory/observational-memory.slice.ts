/**
 * Observational Memory Slice
 *
 * Per-conversation state for the admin-gated Observational Memory feature.
 *
 * Captures everything the UI needs to present "full insight" into what memory
 * is doing for a conversation:
 *   - the persisted enabled/model/scope block (mirrored from
 *     cx_conversation.metadata.observational_memory)
 *   - live per-turn event log (Observer / Reflector / buffer / context /
 *     error events streamed during an active run)
 *   - running cost/token counters aggregated from the stream events (fast,
 *     local feedback while a turn is active)
 *   - the admin-only `memory_cost` endpoint rollup (authoritative post-run)
 *   - a `degraded` flag raised when any `memory_error` fires
 *
 * Lives separately from `observability` because memory events are
 * intentionally NOT folded into `cx_user_request.total_cost` /
 * `cx_request.cost` on the backend — memory is infrastructure cost.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  MemoryContextInjectedData,
  MemoryObserverCompletedData,
  MemoryReflectorCompletedData,
  MemoryBufferSpawnedData,
  MemoryErrorData,
} from "@/types/python-generated/stream-events";
import type { components } from "@/types/python-generated/api-types";

// =============================================================================
// Types
// =============================================================================

/** Mirrors the server-side `MemoryCostSummary` schema. */
export type MemoryCostSummary = components["schemas"]["MemoryCostSummary"];

/** Persisted block on `cx_conversation.metadata.observational_memory`. */
export interface ObservationalMemoryMetadata {
  enabled: boolean;
  enabled_at?: string | null;
  enabled_by?: string | null;
  model?: string | null;
  scope?: "thread" | "resource" | string;
  disabled_at?: string | null;
}

/**
 * Individual memory event as projected onto the UI timeline. Captures
 * everything we need to render a per-turn activity feed without having to
 * re-fetch from the DB.
 */
export type MemoryEventKind =
  | "context_injected"
  | "observer_completed"
  | "reflector_completed"
  | "buffer_spawned"
  | "error";

export interface MemoryEventEntry {
  /** Stable client-generated id — event ordinal within conversation. */
  id: string;
  kind: MemoryEventKind;
  /** Populated from stream events that carry it. */
  requestId?: string | null;
  receivedAt: string;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  durationMs?: number | null;
  /** For `buffer_spawned` events. */
  bufferKind?: "observer" | "reflector" | string;
  /** For `context_injected` events. */
  observationChars?: number;
  /** For `error` events. */
  phase?: string | null;
  error?: string | null;
}

/** Aggregated running counters computed locally from streamed events. */
export interface MemoryRunningCounters {
  totalEvents: number;
  observerEvents: number;
  reflectorEvents: number;
  bufferEvents: number;
  errorEvents: number;
  contextInjections: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  /** Last `memory_context_injected.observation_chars` we saw, if any. */
  lastContextChars: number | null;
}

export interface MemoryCostFetchState {
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  fetchedAt: string | null;
}

export interface ObservationalMemoryConversationState {
  conversationId: string;
  /** Snapshot of the persisted metadata block (from cx_conversation). */
  metadata: ObservationalMemoryMetadata | null;
  /** Derived flag — convenience accessor; mirrors metadata.enabled. */
  isEnabled: boolean;
  /** True when any memory_error event has fired this session. */
  degraded: boolean;
  /** Last memory_error that fired, if any (for a subtle warning UI). */
  lastError: {
    phase?: string | null;
    error?: string | null;
    model?: string | null;
    at: string;
  } | null;
  /** Ordered event log (oldest → newest). Bounded to MAX_EVENTS. */
  events: MemoryEventEntry[];
  /** Running counters aggregated from `events`. */
  counters: MemoryRunningCounters;
  /** Authoritative rollup from GET /conversations/:id/memory_cost. */
  costSummary: MemoryCostSummary | null;
  costFetch: MemoryCostFetchState;
}

export interface ObservationalMemoryState {
  byConversationId: Record<string, ObservationalMemoryConversationState>;
}

const MAX_EVENTS = 500;

const initialState: ObservationalMemoryState = {
  byConversationId: {},
};

// =============================================================================
// Helpers
// =============================================================================

function emptyCounters(): MemoryRunningCounters {
  return {
    totalEvents: 0,
    observerEvents: 0,
    reflectorEvents: 0,
    bufferEvents: 0,
    errorEvents: 0,
    contextInjections: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    lastContextChars: null,
  };
}

function ensureEntry(
  state: ObservationalMemoryState,
  conversationId: string,
): ObservationalMemoryConversationState {
  const existing = state.byConversationId[conversationId];
  if (existing) return existing;
  const fresh: ObservationalMemoryConversationState = {
    conversationId,
    metadata: null,
    isEnabled: false,
    degraded: false,
    lastError: null,
    events: [],
    counters: emptyCounters(),
    costSummary: null,
    costFetch: { status: "idle", error: null, fetchedAt: null },
  };
  state.byConversationId[conversationId] = fresh;
  return fresh;
}

function nextEventId(entry: ObservationalMemoryConversationState): string {
  return `mem-${entry.counters.totalEvents + 1}`;
}

function pushEvent(
  entry: ObservationalMemoryConversationState,
  event: MemoryEventEntry,
): void {
  entry.events.push(event);
  if (entry.events.length > MAX_EVENTS) {
    entry.events.splice(0, entry.events.length - MAX_EVENTS);
  }
}

// =============================================================================
// Slice
// =============================================================================

const observationalMemorySlice = createSlice({
  name: "observationalMemory",
  initialState,
  reducers: {
    /**
     * Sync the persisted `observational_memory` block from the conversation
     * metadata (normally read off `cx_conversation.metadata` on bundle load
     * / first open). Safe to call repeatedly — it just overwrites.
     */
    setMemoryMetadata(
      state,
      action: PayloadAction<{
        conversationId: string;
        metadata: ObservationalMemoryMetadata | null;
      }>,
    ) {
      const { conversationId, metadata } = action.payload;
      const entry = ensureEntry(state, conversationId);
      entry.metadata = metadata;
      entry.isEnabled = Boolean(metadata?.enabled);
    },

    /**
     * Optimistically flip the enabled flag (used when an admin toggles on
     * the Creator panel before the next turn persists the change on the
     * server). Server reconciliation happens via setMemoryMetadata on the
     * next bundle load or stream.
     */
    setMemoryEnabledOptimistic(
      state,
      action: PayloadAction<{
        conversationId: string;
        enabled: boolean;
        model?: string | null;
        scope?: string | null;
      }>,
    ) {
      const { conversationId, enabled, model, scope } = action.payload;
      const entry = ensureEntry(state, conversationId);
      entry.isEnabled = enabled;
      entry.metadata = {
        enabled,
        enabled_at: enabled
          ? (entry.metadata?.enabled_at ?? new Date().toISOString())
          : (entry.metadata?.enabled_at ?? null),
        enabled_by: entry.metadata?.enabled_by ?? null,
        model: model ?? entry.metadata?.model ?? null,
        scope: scope ?? entry.metadata?.scope ?? "thread",
        disabled_at: enabled ? null : new Date().toISOString(),
      };
    },

    // ── Stream event ingestion ───────────────────────────────────────────────

    recordContextInjected(
      state,
      action: PayloadAction<{
        conversationId: string;
        requestId?: string | null;
        data: MemoryContextInjectedData;
      }>,
    ) {
      const { conversationId, requestId, data } = action.payload;
      const entry = ensureEntry(state, conversationId);
      const event: MemoryEventEntry = {
        id: nextEventId(entry),
        kind: "context_injected",
        requestId: requestId ?? null,
        receivedAt: new Date().toISOString(),
        observationChars: data.observation_chars,
      };
      pushEvent(entry, event);
      entry.counters.totalEvents += 1;
      entry.counters.contextInjections += 1;
      if (typeof data.observation_chars === "number") {
        entry.counters.lastContextChars = data.observation_chars;
      }
    },

    recordObserverCompleted(
      state,
      action: PayloadAction<{
        conversationId: string;
        requestId?: string | null;
        data: MemoryObserverCompletedData;
      }>,
    ) {
      const { conversationId, requestId, data } = action.payload;
      const entry = ensureEntry(state, conversationId);
      const event: MemoryEventEntry = {
        id: nextEventId(entry),
        kind: "observer_completed",
        requestId: requestId ?? null,
        receivedAt: new Date().toISOString(),
        model: data.model ?? null,
        inputTokens: data.input_tokens,
        outputTokens: data.output_tokens,
        cost: data.cost,
        durationMs: data.duration_ms ?? null,
      };
      pushEvent(entry, event);
      entry.counters.totalEvents += 1;
      entry.counters.observerEvents += 1;
      entry.counters.totalInputTokens += data.input_tokens ?? 0;
      entry.counters.totalOutputTokens += data.output_tokens ?? 0;
      entry.counters.totalCost += data.cost ?? 0;
    },

    recordReflectorCompleted(
      state,
      action: PayloadAction<{
        conversationId: string;
        requestId?: string | null;
        data: MemoryReflectorCompletedData;
      }>,
    ) {
      const { conversationId, requestId, data } = action.payload;
      const entry = ensureEntry(state, conversationId);
      const event: MemoryEventEntry = {
        id: nextEventId(entry),
        kind: "reflector_completed",
        requestId: requestId ?? null,
        receivedAt: new Date().toISOString(),
        model: data.model ?? null,
        inputTokens: data.input_tokens,
        outputTokens: data.output_tokens,
        cost: data.cost,
        durationMs: data.duration_ms ?? null,
      };
      pushEvent(entry, event);
      entry.counters.totalEvents += 1;
      entry.counters.reflectorEvents += 1;
      entry.counters.totalInputTokens += data.input_tokens ?? 0;
      entry.counters.totalOutputTokens += data.output_tokens ?? 0;
      entry.counters.totalCost += data.cost ?? 0;
    },

    recordBufferSpawned(
      state,
      action: PayloadAction<{
        conversationId: string;
        requestId?: string | null;
        data: MemoryBufferSpawnedData;
      }>,
    ) {
      const { conversationId, requestId, data } = action.payload;
      const entry = ensureEntry(state, conversationId);
      const event: MemoryEventEntry = {
        id: nextEventId(entry),
        kind: "buffer_spawned",
        requestId: requestId ?? null,
        receivedAt: new Date().toISOString(),
        bufferKind: data.kind,
      };
      pushEvent(entry, event);
      entry.counters.totalEvents += 1;
      entry.counters.bufferEvents += 1;
    },

    recordMemoryError(
      state,
      action: PayloadAction<{
        conversationId: string;
        requestId?: string | null;
        data: MemoryErrorData;
      }>,
    ) {
      const { conversationId, requestId, data } = action.payload;
      const entry = ensureEntry(state, conversationId);
      const at = new Date().toISOString();
      const event: MemoryEventEntry = {
        id: nextEventId(entry),
        kind: "error",
        requestId: requestId ?? null,
        receivedAt: at,
        model: data.model ?? null,
        phase: data.phase ?? null,
        error: data.error ?? null,
      };
      pushEvent(entry, event);
      entry.counters.totalEvents += 1;
      entry.counters.errorEvents += 1;
      entry.degraded = true;
      entry.lastError = {
        phase: data.phase ?? null,
        error: data.error ?? null,
        model: data.model ?? null,
        at,
      };
    },

    clearDegraded(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        entry.degraded = false;
        entry.lastError = null;
      }
    },

    clearEvents(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        entry.events = [];
        entry.counters = emptyCounters();
        entry.degraded = false;
        entry.lastError = null;
      }
    },

    // ── Cost endpoint ────────────────────────────────────────────────────────

    setCostFetchStatus(
      state,
      action: PayloadAction<{
        conversationId: string;
        status: MemoryCostFetchState["status"];
        error?: string | null;
      }>,
    ) {
      const entry = ensureEntry(state, action.payload.conversationId);
      entry.costFetch.status = action.payload.status;
      entry.costFetch.error = action.payload.error ?? null;
    },

    setCostSummary(
      state,
      action: PayloadAction<{
        conversationId: string;
        summary: MemoryCostSummary;
      }>,
    ) {
      const entry = ensureEntry(state, action.payload.conversationId);
      entry.costSummary = action.payload.summary;
      entry.costFetch = {
        status: "success",
        error: null,
        fetchedAt: new Date().toISOString(),
      };
    },

    clearForConversation(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },
  },
});

export const {
  setMemoryMetadata,
  setMemoryEnabledOptimistic,
  recordContextInjected,
  recordObserverCompleted,
  recordReflectorCompleted,
  recordBufferSpawned,
  recordMemoryError,
  clearDegraded,
  clearEvents,
  setCostFetchStatus,
  setCostSummary,
  clearForConversation,
} = observationalMemorySlice.actions;

export default observationalMemorySlice.reducer;
