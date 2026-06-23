/**
 * Active Requests Slice — V2 Event System
 *
 * Tracks everything that happens after an API call fires.
 * Each semantically distinct server event type gets its own dedicated
 * storage field — no untyped catch-all bags.
 *
 * V2 Storage map:
 *   chunk              → textChunks (O(1) push) + lazy join in selectors
 *   reasoning_chunk    → reasoningChunks (same pattern)
 *   phase              → currentPhase + phaseHistory
 *   init               → activeOperations (keyed by operation_id)
 *   completion         → completedOperations + completion (user_request)
 *   render_block      → renderBlocks (Record by blockId) + renderBlockOrder
 *   tool_event         → toolLifecycle (Record by callId) + pendingToolCalls
 *   data (typed)       → dataPayloads (typed, with `type` discriminator)
 *   warning            → warnings
 *   info               → infoEvents
 *   record_reserved    → reservations
 *   record_update      → reservations (status update)
 *   error              → error (verbatim ErrorPayload) + status change
 *   heartbeat          → dropped (no storage)
 *   end                → status change only
 *   broker             → dataPayloads (frozen — no new usage)
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ActiveRequest,
  RequestRouting,
  RequestStatus,
  PendingToolCall,
  ClientMetrics,
  ToolLifecycleEntry,
  ToolLifecycleStatus,
  TimelineEntry,
  RawStreamEvent,
  ReservationRecord,
  ReservationStatus,
} from "@/features/agents/types/request.types";
import type {
  Phase,
  Operation,
  InitCompletionStatus,
  RenderBlockPayload,
  CompletionPayload,
  WarningPayload,
  InfoPayload,
  TypedDataPayload,
  UntypedDataPayload,
  ToolEventPayload,
  ErrorPayload,
  ProviderRetryPayload,
} from "@/types/python-generated/stream-events";
import { generateRequestId } from "../utils/ids";
import { destroyInstance } from "../conversations/conversations.slice";

// =============================================================================
// State
// =============================================================================

export interface ActiveRequestsState {
  byRequestId: Record<string, ActiveRequest>;
  byConversationId: Record<string, string[]>;
}

// =============================================================================
// DB-hydration helpers
// =============================================================================

/**
 * The subset of `CxUserRequestRecord` we need to rebuild an
 * `ActiveRequest` from after a reload. Mirrors the observability
 * slice's record shape one-for-one — kept local to avoid a slice→slice
 * dep cycle.
 */
export interface HydratedRequestRow {
  id: string;
  status: string;
  iterations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalTokens: number;
  totalToolCalls: number;
  totalCost: number | null;
  totalDurationMs: number | null;
  apiDurationMs: number | null;
  toolDurationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

function mapHydratedStatus(raw: string): RequestStatus {
  // cx_user_request.status uses the same vocabulary as RequestStatus —
  // map defensively in case a new server value appears.
  switch (raw) {
    case "pending":
    case "connecting":
    case "streaming":
    case "awaiting-tools":
    case "complete":
    case "error":
    case "timeout":
    case "cancelled":
      return raw;
    case "success":
    case "completed":
      return "complete";
    case "failed":
    case "errored":
      return "error";
    default:
      // Unknown server status — treat as complete so the inline usage
      // strip + Runs table render their numbers instead of hiding.
      return "complete";
  }
}

function buildHydratedResult(row: HydratedRequestRow): Record<string, unknown> {
  return {
    total_usage: {
      total: {
        input_tokens: row.totalInputTokens,
        output_tokens: row.totalOutputTokens,
        cached_input_tokens: row.totalCachedTokens,
        total_tokens: row.totalTokens,
        total_cost: row.totalCost ?? 0,
        // total_requests isn't stored on cx_user_request; consumers
        // surface this as the count of LLM calls (cx_request rows) when
        // they need it. Zero is the safe display fallback.
        total_requests: 0,
      },
    },
    timing_stats: {
      total_duration: row.totalDurationMs ?? 0,
      api_duration: row.apiDurationMs ?? 0,
      tool_duration: row.toolDurationMs ?? 0,
    },
    tool_call_stats: {
      total_tool_calls: row.totalToolCalls,
    },
    iterations: row.iterations,
  };
}

const initialState: ActiveRequestsState = {
  byRequestId: {},
  byConversationId: {},
};

// =============================================================================
// Slice
// =============================================================================

const activeRequestsSlice = createSlice({
  name: "activeRequests",
  initialState,
  reducers: {
    createRequest(
      state,
      action: PayloadAction<{
        requestId?: string;
        conversationId: string;
        parentConversationId?: string | null;
      }>,
    ) {
      const {
        requestId = generateRequestId(),
        conversationId,
        parentConversationId = null,
      } = action.payload;

      const now = new Date().toISOString();

      state.byRequestId[requestId] = {
        requestId,
        conversationId,
        parentConversationId,
        status: "pending",
        chunkCount: 0,
        editedText: null,
        reasoningChunks: [],
        accumulatedReasoning: "",
        isReasoningStreaming: false,
        reasoningRunChunkStart: 0,
        currentPhase: null,
        phaseHistory: [],
        activeOperations: {},
        completedOperations: {},
        renderBlocks: {},
        renderBlockOrder: [],
        toolLifecycle: {},
        pendingToolCalls: [],
        completion: null,
        error: null,
        warnings: [],
        infoEvents: [],
        providerRetry: null,
        providerRetryHistory: [],
        reservations: {},
        dataPayloads: [],
        timeline: [],
        rawEvents: [],
        isTextStreaming: false,
        textRunBlockStart: 0,
        currentTextRunRaw: "",
        extractedJson: null,
        jsonExtractionRevision: 0,
        jsonExtractionComplete: false,
        startedAt: now,
        firstChunkAt: null,
        completedAt: null,
        clientMetrics: null,
        routing: null,
      };

      if (!state.byConversationId[conversationId]) {
        state.byConversationId[conversationId] = [];
      }
      state.byConversationId[conversationId].push(requestId);
    },

    /**
     * Stamp the factual routing record for a request at send time. Ground
     * truth for the Creator Hub Routing tab — where the turn went + whether
     * the sandbox binding attached.
     */
    setRequestRouting(
      state,
      action: PayloadAction<{
        requestId: string;
        routing: RequestRouting;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) request.routing = action.payload.routing;
    },

    setRequestStatus(
      state,
      action: PayloadAction<{
        requestId: string;
        status: RequestStatus;
        /**
         * Backend `ErrorPayload` captured verbatim. Provide ONLY when
         * transitioning to "error" so the technical (`message`) and
         * user-friendly (`user_message`) strings survive intact for the
         * UI to choose between.
         */
        error?: ErrorPayload;
      }>,
    ) {
      const { requestId, status, error } = action.payload;
      const request = state.byRequestId[requestId];
      if (request) {
        request.status = status;
        if (error !== undefined) request.error = error;
        if (
          status === "complete" ||
          status === "error" ||
          status === "timeout" ||
          status === "cancelled"
        ) {
          request.completedAt = new Date().toISOString();
        }
      }
    },

    // ── Chunks ─────────────────────────────────────────────────

    appendChunk(
      state,
      action: PayloadAction<{ requestId: string; content: string }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request) return;
      if (!request.firstChunkAt) {
        request.firstChunkAt = new Date().toISOString();
      }
      request.chunkCount++;
      // Preserve the raw markdown per text run so the stream-commit path
      // can write the exact wire-format text into `cx_message.content`.
      // The block accumulator strips fences, table pipes, and XML markers
      // when it builds typed render blocks — if we lose the raw text here
      // the committed content comes back as plain text after reload.
      if (request.isTextStreaming) {
        request.currentTextRunRaw += action.payload.content;
      }
    },

    // ── Reasoning Chunks ─────────────────────────────────────────

    appendReasoningChunk(
      state,
      action: PayloadAction<{ requestId: string; content: string }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) {
        request.reasoningChunks.push(action.payload.content);
        request.accumulatedReasoning += action.payload.content;
      }
    },

    /**
     * No-op retained for backward compat — accumulatedReasoning is now maintained
     * incrementally by appendReasoningChunk. Safe to call; does nothing.
     */
    finalizeAccumulatedReasoning(
      _state,
      _action: PayloadAction<{ requestId: string }>,
    ) {
      // accumulatedReasoning is already up-to-date from appendReasoningChunk
    },

    markReasoningStreamStart(
      state,
      action: PayloadAction<{ requestId: string; timestamp: number }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request) return;

      request.isReasoningStreaming = true;
      request.reasoningRunChunkStart = request.reasoningChunks.length;

      request.timeline.push({
        kind: "reasoning_start",
        seq: request.timeline.length,
        timestamp: action.payload.timestamp,
        chunkStartIndex: request.reasoningChunks.length,
      });
    },

    closeReasoningRun(
      state,
      action: PayloadAction<{ requestId: string; timestamp: number }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request || !request.isReasoningStreaming) return;

      request.timeline.push({
        kind: "reasoning_end",
        seq: request.timeline.length,
        timestamp: action.payload.timestamp,
        chunkStartIndex: request.reasoningRunChunkStart,
        chunkEndIndex: request.reasoningChunks.length,
        chunkCount:
          request.reasoningChunks.length - request.reasoningRunChunkStart,
      });
      request.isReasoningStreaming = false;
    },

    // ── Phase (replaces status_update) ──────────────────────────

    setCurrentPhase(
      state,
      action: PayloadAction<{
        requestId: string;
        phase: Phase;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) {
        request.currentPhase = action.payload.phase;
        request.phaseHistory.push(action.payload.phase);
      }
    },

    // ── Operation Tracking (init/completion pairs) ────────────

    trackOperationInit(
      state,
      action: PayloadAction<{
        requestId: string;
        operationId: string;
        operation: Operation;
        parentOperationId?: string | null;
        timestamp: number;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request) return;

      request.activeOperations[action.payload.operationId] = {
        operationId: action.payload.operationId,
        operation: action.payload.operation,
        parentOperationId: action.payload.parentOperationId ?? null,
        startedAt: action.payload.timestamp,
      };
    },

    trackOperationCompletion(
      state,
      action: PayloadAction<{
        requestId: string;
        operationId: string;
        operation: Operation;
        status: InitCompletionStatus;
        result: Record<string, unknown>;
        timestamp: number;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request) return;

      const active = request.activeOperations[action.payload.operationId];
      const startedAt = active?.startedAt ?? action.payload.timestamp;

      request.completedOperations[action.payload.operationId] = {
        operationId: action.payload.operationId,
        operation: action.payload.operation,
        parentOperationId: active?.parentOperationId ?? null,
        startedAt,
        status: action.payload.status,
        result: action.payload.result,
        completedAt: action.payload.timestamp,
        durationMs: action.payload.timestamp - startedAt,
      };

      delete request.activeOperations[action.payload.operationId];
    },

    // ── Edited Text Override ──────────────────────────────────
    //
    // Set by inline-edit flows (inline decision resolve, code-block save,
    // table edit, inline broker update, full-screen save) so the renderer
    // stays in sync with what we just persisted via `cx_message_edit`,
    // without having to swap the renderer's data source mid-session.
    //
    // Per the AgentAssistantMessage lifetime rule, the renderer keeps
    // reading from `activeRequests.byRequestId[reqId]` for as long as the
    // conversation instance is mounted — so a successful DB write alone
    // isn't enough to update the display. This field bridges that gap.

    setRequestEditedText(
      state,
      action: PayloadAction<{ requestId: string; text: string }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) {
        request.editedText = action.payload.text;
      }
    },

    clearRequestEditedText(
      state,
      action: PayloadAction<{ requestId: string }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) {
        request.editedText = null;
      }
    },

    // ── Render Blocks ─────────────────────────────────────────

    upsertRenderBlock(
      state,
      action: PayloadAction<{
        requestId: string;
        block: RenderBlockPayload;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request) return;

      const { block } = action.payload;
      const isNew = !(block.blockId in request.renderBlocks);

      request.renderBlocks[block.blockId] = block;

      if (isNew) {
        request.renderBlockOrder.push(block.blockId);
      }
    },

    // ── Tool Lifecycle ─────────────────────────────────────────
    //
    // NOT a render source for the chat transcript. The canonical selector
    // (`selectMessageInterleavedContent`) reads tool data from
    // `observability.toolCalls` and joins it onto the cx_message
    // tool_call stub blocks. `toolLifecycle` lives here for the
    // runner/debug overlay (ExecutionInstanceInspector) and the
    // floating tool-call window (ToolCallWindowPanel) which need the
    // raw event log + per-callId live state during the stream.

    upsertToolLifecycle(
      state,
      action: PayloadAction<{
        requestId: string;
        callId: string;
        toolName: string;
        status: ToolLifecycleStatus;
        arguments?: Record<string, unknown>;
        message?: string | null;
        data?: Record<string, unknown> | null;
        result?: unknown;
        resultPreview?: string | null;
        errorType?: string | null;
        errorMessage?: string | null;
        isDelegated?: boolean;
        /**
         * Raw event payload (if available). Appended verbatim to the entry's
         * events[] so renderers can walk the full event log without any
         * client-side reshaping.
         */
        event?: ToolEventPayload;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request) return;

      const {
        callId,
        toolName,
        status,
        message,
        data,
        result,
        resultPreview,
        errorType,
        errorMessage: toolError,
        isDelegated,
        event,
      } = action.payload;
      const args = action.payload.arguments;

      const existing = request.toolLifecycle[callId];
      const now = new Date().toISOString();

      if (existing) {
        existing.status = status;
        // Backfill arguments on any event that carries a populated object.
        // Guard against an empty `{}` clobbering real args already captured
        // (events after `tool_started` may omit them), and against a late
        // populated payload never landing because the entry already existed.
        if (
          args &&
          typeof args === "object" &&
          !Array.isArray(args) &&
          Object.keys(args).length > 0
        ) {
          existing.arguments = args;
        }
        if (message !== undefined) existing.latestMessage = message ?? null;
        if (data !== undefined) existing.latestData = data ?? null;
        if (result !== undefined) existing.result = result;
        if (resultPreview !== undefined)
          existing.resultPreview = resultPreview ?? null;
        if (errorType !== undefined) existing.errorType = errorType ?? null;
        if (toolError !== undefined) existing.errorMessage = toolError ?? null;
        if (isDelegated !== undefined) existing.isDelegated = isDelegated;
        if (status === "completed" || status === "error") {
          existing.completedAt = now;
        }
        if (event) existing.events.push(event);
      } else {
        request.toolLifecycle[callId] = {
          callId,
          toolName,
          // Streamed events carry the canonical name; as-called is backfilled
          // when the conversation is reloaded from cx_tool_call.tool_name_as_called.
          displayName: toolName,
          status,
          arguments: args ?? {},
          startedAt: now,
          completedAt:
            status === "completed" || status === "error" ? now : null,
          latestMessage: message ?? null,
          latestData: data ?? null,
          result: result ?? null,
          resultPreview: resultPreview ?? null,
          errorType: errorType ?? null,
          errorMessage: toolError ?? null,
          isDelegated: isDelegated ?? false,
          events: event ? [event] : [],
        };
      }
    },

    addPendingToolCall(
      state,
      action: PayloadAction<{
        requestId: string;
        toolCall: Omit<
          PendingToolCall,
          "receivedAt" | "deadlineAt" | "resolved"
        >;
      }>,
    ) {
      const { requestId, toolCall } = action.payload;
      const request = state.byRequestId[requestId];
      if (request) {
        const now = new Date();
        const deadline = new Date(now.getTime() + 120_000);

        request.pendingToolCalls.push({
          ...toolCall,
          receivedAt: now.toISOString(),
          deadlineAt: deadline.toISOString(),
          resolved: false,
        });
        request.status = "awaiting-tools";
      }
    },

    resolveToolCall(
      state,
      action: PayloadAction<{ requestId: string; callId: string }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) {
        const call = request.pendingToolCalls.find(
          (c) => c.callId === action.payload.callId,
        );
        if (call) {
          call.resolved = true;
        }

        const allResolved = request.pendingToolCalls.every((c) => c.resolved);
        if (allResolved && request.status === "awaiting-tools") {
          request.status = "streaming";
        }
      }
    },

    /**
     * Terminal-out every non-terminal tool the stream left behind.
     *
     * Called when the request itself ends in error/timeout/cancel: any
     * `toolLifecycle` entry still in a live status (`started` / `progress` /
     * `step` / `result_preview`) is force-transitioned to `error` and any
     * unresolved `pendingToolCalls` are marked resolved. Without this the
     * `LiveToolCallCard` shimmer ("Using tool …") keeps spinning forever
     * after the parent stream died — the very bug a heartbeat-timeout was
     * supposed to surface.
     *
     * The error metadata (`errorType` / `errorMessage`) is synthesized
     * client-side because the server never sent the tool's terminal event —
     * this is the canonical "stream_aborted" / "heartbeat_timeout" shape so
     * downstream UI can distinguish a tool that the model declared failed
     * from one whose status was never resolved.
     */
    failPendingToolLifecycle(
      state,
      action: PayloadAction<{
        requestId: string;
        errorType: string;
        errorMessage: string;
      }>,
    ) {
      const { requestId, errorType, errorMessage } = action.payload;
      const request = state.byRequestId[requestId];
      if (!request) return;

      const now = new Date().toISOString();
      for (const callId of Object.keys(request.toolLifecycle)) {
        const entry = request.toolLifecycle[callId];
        if (!entry) continue;
        if (entry.status === "completed" || entry.status === "error") continue;
        entry.status = "error";
        entry.completedAt = now;
        entry.errorType = entry.errorType ?? errorType;
        entry.errorMessage = entry.errorMessage ?? errorMessage;
      }

      for (const call of request.pendingToolCalls) {
        if (!call.resolved) call.resolved = true;
      }
    },

    // ── Completion ─────────────────────────────────────────────

    setCompletion(
      state,
      action: PayloadAction<{
        requestId: string;
        data: CompletionPayload;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) {
        request.completion = action.payload.data;
      }
    },

    // ── Data Events (genuine catch-all) ────────────────────────

    appendDataPayload(
      state,
      action: PayloadAction<{
        requestId: string;
        data: TypedDataPayload | UntypedDataPayload;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) {
        request.dataPayloads.push(action.payload.data);
      }
    },

    // ── Warnings & Info ────────────────────────────────────────

    addWarning(
      state,
      action: PayloadAction<{
        requestId: string;
        warning: WarningPayload;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) {
        request.warnings.push(action.payload.warning);
      }
    },

    addInfoEvent(
      state,
      action: PayloadAction<{
        requestId: string;
        info: InfoPayload;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) {
        request.infoEvents.push(action.payload.info);
      }
    },

    setProviderRetry(
      state,
      action: PayloadAction<{
        requestId: string;
        retry: ProviderRetryPayload;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request) return;
      request.providerRetry = action.payload.retry;
      request.providerRetryHistory.push(action.payload.retry);
    },

    // ── Record Reservations ──────────────────────────────────────

    upsertReservation(
      state,
      action: PayloadAction<{
        requestId: string;
        recordId: string;
        dbProject: string;
        table: string;
        status: ReservationStatus;
        parentRefs?: Record<string, string>;
        metadata?: Record<string, unknown>;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request) return;

      const { recordId, dbProject, table, status, parentRefs, metadata } =
        action.payload;

      const existing = request.reservations[recordId];
      if (existing) {
        existing.status = status;
        if (metadata) Object.assign(existing.metadata, metadata);
      } else {
        request.reservations[recordId] = {
          dbProject,
          table,
          recordId,
          status,
          parentRefs: parentRefs ?? {},
          metadata: metadata ?? {},
        };
      }
    },

    // ── Event Timeline ──────────────────────────────────────────

    /**
     * Append a non-chunk event to the timeline.
     * If text is currently streaming, automatically closes the text run first.
     */
    appendTimeline(
      state,
      action: PayloadAction<{
        requestId: string;
        entry: TimelineEntry;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request) return;

      if (request.isTextStreaming) {
        request.timeline.push({
          kind: "text_end",
          seq: request.timeline.length,
          timestamp: action.payload.entry.timestamp,
          blockStartIndex: request.textRunBlockStart,
          blockEndIndex: request.renderBlockOrder.length,
          blockCount:
            request.renderBlockOrder.length - request.textRunBlockStart,
          rawText: request.currentTextRunRaw,
        });
        request.isTextStreaming = false;
        request.currentTextRunRaw = "";
      }

      if (request.isReasoningStreaming) {
        request.timeline.push({
          kind: "reasoning_end",
          seq: request.timeline.length,
          timestamp: action.payload.entry.timestamp,
          chunkStartIndex: request.reasoningRunChunkStart,
          chunkEndIndex: request.reasoningChunks.length,
          chunkCount:
            request.reasoningChunks.length - request.reasoningRunChunkStart,
        });
        request.isReasoningStreaming = false;
      }

      const entry = { ...action.payload.entry, seq: request.timeline.length };
      request.timeline.push(entry);
    },

    /**
     * Captures every raw event exactly as received from the NDJSON parser.
     * No filtering, no coalescing — the forensic truth.
     */
    appendRawEvent(
      state,
      action: PayloadAction<{
        requestId: string;
        event: RawStreamEvent;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request) return;
      request.rawEvents.push(action.payload.event);
    },

    /**
     * Called when the first chunk of a new text run arrives.
     * Records a `text_start` marker referencing the current renderBlockOrder index.
     */
    markTextStreamStart(
      state,
      action: PayloadAction<{
        requestId: string;
        timestamp: number;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request) return;

      request.isTextStreaming = true;
      request.textRunBlockStart = request.renderBlockOrder.length;
      request.currentTextRunRaw = "";

      request.timeline.push({
        kind: "text_start",
        seq: request.timeline.length,
        timestamp: action.payload.timestamp,
        blockStartIndex: request.renderBlockOrder.length,
      });
    },

    /**
     * Explicitly close an open text run (e.g., at stream end).
     * No-op if text is not currently streaming.
     */
    closeTextRun(
      state,
      action: PayloadAction<{
        requestId: string;
        timestamp: number;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (!request || !request.isTextStreaming) return;

      request.timeline.push({
        kind: "text_end",
        seq: request.timeline.length,
        timestamp: action.payload.timestamp,
        blockStartIndex: request.textRunBlockStart,
        blockEndIndex: request.renderBlockOrder.length,
        blockCount: request.renderBlockOrder.length - request.textRunBlockStart,
        rawText: request.currentTextRunRaw,
      });
      request.isTextStreaming = false;
      request.currentTextRunRaw = "";
    },

    // ── Client Metrics ─────────────────────────────────────────

    finalizeClientMetrics(
      state,
      action: PayloadAction<{ requestId: string; metrics: ClientMetrics }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) {
        request.clientMetrics = action.payload.metrics;
      }
    },

    // ── JSON Extraction ─────────────────────────────────────────

    updateExtractedJson(
      state,
      action: PayloadAction<{
        requestId: string;
        results: ActiveRequest["extractedJson"];
        revision: number;
        isComplete: boolean;
      }>,
    ) {
      const request = state.byRequestId[action.payload.requestId];
      if (request) {
        request.extractedJson = action.payload.results;
        request.jsonExtractionRevision = action.payload.revision;
        request.jsonExtractionComplete = action.payload.isComplete;
      }
    },

    // ── Cleanup ────────────────────────────────────────────────

    removeRequest(state, action: PayloadAction<string>) {
      const request = state.byRequestId[action.payload];
      if (request) {
        const conversationRequests =
          state.byConversationId[request.conversationId];
        if (conversationRequests) {
          state.byConversationId[request.conversationId] =
            conversationRequests.filter((id) => id !== action.payload);
          if (state.byConversationId[request.conversationId].length === 0) {
            delete state.byConversationId[request.conversationId];
          }
        }
        delete state.byRequestId[action.payload];
      }
    },

    /**
     * Rebuild minimal `ActiveRequest` entries from the observability DB
     * rows (one cx_user_request row per finished agent turn). This is
     * how the inline UsageStrip and the Runs comparison table keep
     * working after a page reload — without it both would show empty
     * because `byRequestId` is purely in-memory streaming state.
     *
     * Only fields the post-stream UI actually reads get populated:
     *   - `completion.result` (token totals / cost / timing / iterations
     *     / tool_call_stats) — matches the shape `getUserRequestResult`
     *     pulls out of a live stream's completion event
     *   - top-level `status` / `startedAt` / `completedAt`
     *
     * `clientMetrics` (TTFT / total client duration) stays null because
     * those numbers aren't persisted server-side — the UI shows "—" for
     * those tiles after a reload, which is the correct affordance.
     *
     * Defensive: if a requestId already exists in `byRequestId` (live
     * stream just completed and stayed mounted), we DO NOT overwrite —
     * the live entry has richer data than the hydrated row.
     */
    hydrateRequestsFromObservability(
      state,
      action: PayloadAction<{
        conversationId: string;
        rows: HydratedRequestRow[];
      }>,
    ) {
      const { conversationId, rows } = action.payload;
      const existingIds = new Set(state.byConversationId[conversationId] ?? []);
      const newIds: string[] = [];
      for (const row of rows) {
        if (state.byRequestId[row.id]) {
          // Already in memory — live stream beat us to it. Keep live.
          continue;
        }
        const status = mapHydratedStatus(row.status);
        const result = buildHydratedResult(row);
        state.byRequestId[row.id] = {
          requestId: row.id,
          conversationId,
          parentConversationId: null,
          status,
          chunkCount: 0,
          editedText: null,
          reasoningChunks: [],
          accumulatedReasoning: "",
          isReasoningStreaming: false,
          reasoningRunChunkStart: 0,
          currentPhase: null,
          phaseHistory: [],
          activeOperations: {},
          completedOperations: {},
          renderBlocks: {},
          renderBlockOrder: [],
          toolLifecycle: {},
          pendingToolCalls: [],
          completion: {
            operation: "user_request",
            operation_id: row.id,
            status: status === "complete" ? "success" : "failed",
            result,
          } as CompletionPayload,
          // routing is stamped at send-time on live runs; hydrated rows from
          // history don't have it (the executor decision was made on a past
          // server process), so we initialize null. Selectors that read it
          // (selectRequestRouting) tolerate null.
          routing: null,
          error: null,
          warnings: [],
          infoEvents: [],
          providerRetry: null,
          providerRetryHistory: [],
          reservations: {},
          dataPayloads: [],
          timeline: [],
          rawEvents: [],
          isTextStreaming: false,
          textRunBlockStart: 0,
          currentTextRunRaw: "",
          extractedJson: null,
          jsonExtractionRevision: 0,
          jsonExtractionComplete: false,
          startedAt: row.createdAt,
          firstChunkAt: null,
          completedAt: row.completedAt,
          clientMetrics: null,
        };
        if (!existingIds.has(row.id)) {
          newIds.push(row.id);
        }
      }
      if (newIds.length > 0) {
        const merged = [
          ...(state.byConversationId[conversationId] ?? []),
          ...newIds,
        ];
        state.byConversationId[conversationId] = merged;
      }
    },
  },

  extraReducers: (builder) => {
    builder.addCase(destroyInstance, (state, action) => {
      const conversationId = action.payload;
      const requestIds = state.byConversationId[conversationId] ?? [];
      for (const reqId of requestIds) {
        delete state.byRequestId[reqId];
      }
      delete state.byConversationId[conversationId];
    });
  },
});

export const {
  createRequest,
  setRequestStatus,
  setRequestRouting,
  appendChunk,
  appendReasoningChunk,
  finalizeAccumulatedReasoning,
  markReasoningStreamStart,
  closeReasoningRun,
  setCurrentPhase,
  trackOperationInit,
  trackOperationCompletion,
  upsertRenderBlock,
  setRequestEditedText,
  clearRequestEditedText,
  upsertToolLifecycle,
  addPendingToolCall,
  resolveToolCall,
  failPendingToolLifecycle,
  setCompletion,
  appendDataPayload,
  addWarning,
  addInfoEvent,
  setProviderRetry,
  upsertReservation,
  appendTimeline,
  appendRawEvent,
  markTextStreamStart,
  closeTextRun,
  finalizeClientMetrics,
  updateExtractedJson,
  removeRequest,
  hydrateRequestsFromObservability,
} = activeRequestsSlice.actions;

export default activeRequestsSlice.reducer;
