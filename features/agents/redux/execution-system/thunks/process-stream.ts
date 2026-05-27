/**
 * Shared Stream Processor — V2 Event System
 *
 * NDJSON stream processing used by executeInstance — handles every typed
 * stream event the backend emits (chunks, phases, tool events, render
 * blocks, resource_changed, errors, etc.).
 *
 * V2 changes from V1:
 *  - `status_update` → `phase` (closed-enum state machine transitions)
 *  - `data` events now use `type` discriminator (not `event` key)
 *  - `completion` events are part of init/completion pairs with operation/operation_id
 *  - New `init` event for operation start tracking
 *  - Old CompletionStats replaced with UserRequestResult from completion.result
 */

import type { RootState } from "@/lib/redux/store";
import type { CompletionStats } from "@/features/agents/types/instance.types";
import type { ClientMetrics } from "@/features/agents/types/request.types";
import type { ToolLifecycleStatus } from "@/features/agents/types/request.types";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { monitorStream } from "@/lib/net/stream-monitor";
import {
  isChunkEvent,
  isReasoningChunkEvent,
  isPhaseEvent,
  isInitEvent,
  isCompletionEvent,
  isTypedDataEvent,
  isToolEventEvent,
  isWarningEvent,
  isInfoEvent,
  isErrorEvent,
  isEndEvent,
  isRenderBlockEvent,
  isHeartbeatEvent,
  isBrokerEvent,
  isRecordReservedEvent,
  isRecordUpdateEvent,
  isResourceChangedEvent,
  isCxMessageReservation,
  isCxRequestReservation,
  isCxToolCallReservation,
  isContextAnalysisEvent,
  isStructuredOutputEvent,
  isContextStateEvent,
  isContextTrimmedEvent,
  isInjectionConsumedEvent,
  type ConversationIdData,
  type ConversationLabeledData,
  type MemoryBufferSpawnedData,
  type MemoryContextInjectedData,
  type MemoryErrorData,
  type MemoryObserverCompletedData,
  type MemoryReflectorCompletedData,
  type UntypedDataPayload,
} from "@/types/python-generated/stream-events";
import {
  addPendingToolCall,
  appendChunk,
  appendReasoningChunk,
  appendDataPayload,
  appendTimeline,
  appendRawEvent,
  markTextStreamStart,
  closeTextRun,
  markReasoningStreamStart,
  closeReasoningRun,
  finalizeAccumulatedReasoning,
  finalizeClientMetrics,
  setRequestStatus,
  setCurrentPhase,
  trackOperationInit,
  trackOperationCompletion,
  addWarning,
  addInfoEvent,
  upsertReservation,
  upsertRenderBlock,
  upsertToolLifecycle,
  setCompletion,
  updateExtractedJson,
} from "../active-requests/active-requests.slice";
import { confirmServerSync } from "../conversations/conversations.slice";
import { receivedFsChange } from "@/features/code/redux/fsChangesSlice";
import { invalidateActiveTools } from "../active-tools/active-tools.slice";
import {
  applyContextState,
  applyContextTrimmed,
} from "../context-state/context-state.slice";
import {
  recordBufferSpawned,
  recordContextInjected,
  recordMemoryError,
  recordObserverCompleted,
  recordReflectorCompleted,
} from "../observational-memory/observational-memory.slice";
import { assertConversationIdMatches } from "../utils/assert-conversation-id";
import { StreamingJsonTracker } from "@/utils/json/streaming-json-tracker";
import { StreamBlockAccumulator } from "../utils/stream-block-accumulator";
import type { ExtractedJsonSnapshot } from "@/features/agents/types/request.types";
import {
  setConversationLabel,
  reserveMessage,
  updateMessageRecord,
  promoteMessageId,
  type MessageRecord,
} from "../messages/messages.slice";
import { fromImageOutputData } from "@/features/files/blocks/image/adapters/from-image-output-data";
import { fromPartialImageData } from "@/features/files/blocks/image/adapters/from-partial-image-data";
import { fromRenderBlock } from "@/features/files/blocks/image/adapters/from-render-block";
import {
  fromMediaBlock,
  isMediaBlockData,
} from "@/features/files/blocks/adapters/from-media-block";
import type {
  ImageOutputData,
  PartialImageData,
} from "@/types/python-generated/stream-events";
import type { UnifiedImageBlock } from "@/features/files/blocks/image/types";
import type { UnifiedMediaBlock } from "@/features/files/blocks/types";
import {
  upsertUserRequest,
  patchUserRequest,
  upsertRequest,
  upsertToolCall,
  patchToolCall,
  type CxUserRequestRecord,
  type CxRequestRecord,
  type CxToolCallRecord,
} from "../observability/observability.slice";
import {
  clearUserInput,
  markInputPersisted,
} from "../instance-user-input/instance-user-input.slice";
import { clearAllResources } from "../instance-resources/instance-resources.slice";
import { resetUserVariableValues } from "../instance-variable-values/instance-variable-values.slice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { setInstanceStatus } from "../conversations/conversations.slice";
import { patchAgentConversationMetadata } from "@/features/agents/redux/conversation-list/conversation-list.slice";
import { upsertAgentConversationFromExecutionAction } from "@/features/agents/redux/conversation-list/record-conversation-from-execution";
import { StreamProfiler } from "@/utils/stream-profiler";
import { assembleMessageParts } from "../utils/assemble-cx-content-blocks";
import { callbackManager } from "@/utils/callbackManager";
import {
  isWidgetActionName,
  type WidgetActionName,
  type WidgetHandle,
} from "@/features/agents/types/widget-handle.types";
import { selectWidgetHandleIdFor } from "../instance-ui-state/instance-ui-state.selectors";
import { dispatchWidgetAction } from "./dispatch-widget-action.thunk";
import { isUiFirstToolName } from "@/features/agents/ui-first-tools/tools/names";
import { dispatchUiFirstTool } from "@/features/agents/ui-first-tools/dispatcher/dispatch-ui-first-tool.thunk";

// =============================================================================
// Types
// =============================================================================

export interface JsonExtractionConfig {
  enabled: boolean;
  /** Enable fuzzy matching (bare blocks, inline) on the finalize pass. Default true. */
  fuzzyOnFinalize?: boolean;
  /** Max JSON values to extract. Default Infinity. */
  maxResults?: number;
}

interface ProcessStreamArgs {
  requestId: string;
  conversationId: string;
  response: Response;
  submitAt: number;
  conversationIdAt: number | null;
  dispatch: (action: unknown) => unknown;
  getState: () => RootState;
  jsonExtraction?: JsonExtractionConfig;
  /**
   * Called once per incoming event, before domain processing. Used by the
   * request-recovery / netRequests system to beat a heartbeat and keep the
   * connection-health watchdog armed. Intentionally void/return — must not
   * throw or mutate the event.
   */
  onEvent?: (event: unknown) => void;
  /**
   * Optional controller for the underlying fetch. If provided, the stream is
   * wrapped with `monitorStream` so that heartbeat/total timeouts can abort
   * the fetch (not just throw out of the loop).
   */
  abortController?: AbortController;
  /**
   * Max ms between events before the stream is declared dead. Default 30_000.
   * Only takes effect when `abortController` is provided.
   */
  heartbeatTimeoutMs?: number;
  /**
   * Max ms total stream lifetime regardless of heartbeats. Default 600_000.
   * Only takes effect when `abortController` is provided.
   */
  maxLifetimeMs?: number;
  /**
   * The client-generated id under which the user's optimistic message was
   * pushed into `messages.byId` before the API call fired. When the server
   * streams `record_reserved cx_message` with role=user, the processor
   * uses this to `promoteMessageId(clientTempId → serverId)` so the same
   * Redux record carries the final server id with no duplication.
   */
  userMessageClientTempId?: string;
  /**
   * Set true for the Agent Builder's manual execution path
   * (`POST /ai/manual`). The wire `conversation_id` minted per call is
   * intentionally different from the local Redux `conversationId`, so:
   *   1. `assertConversationIdMatches` is skipped (the IDs are *expected*
   *      to diverge — that is not server drift).
   *   2. Every `parents.conversation_id` read on incoming stream events is
   *      ignored; the local `conversationId` is used for all dispatches so
   *      streaming events land in the same Redux entry the optimistic user
   *      message lives in (and that the response column is rendering).
   * Agent mode leaves this false and keeps the strict integrity guard.
   */
  forceLocalConversationId?: boolean;
}

export interface ProcessStreamResult {
  conversationId: string | null;
  completionStats: CompletionStats | undefined;
  tokenUsage: { input: number; output: number; total: number } | undefined;
  finishReason: string | undefined;
}

// =============================================================================
// Processor
// =============================================================================

export async function processStream({
  requestId,
  conversationId,
  response,
  submitAt,
  conversationIdAt,
  dispatch,
  getState,
  jsonExtraction,
  onEvent,
  abortController,
  heartbeatTimeoutMs,
  maxLifetimeMs,
  userMessageClientTempId,
  forceLocalConversationId = false,
}: ProcessStreamArgs): Promise<ProcessStreamResult> {
  // Helper for the manual execution path: when forceLocalConversationId is
  // set, stream-event parent_refs.conversation_id is ignored and the local
  // Redux conversationId is used everywhere. See the param docstring above.
  const owningConvId = (wireConvId: string | undefined | null): string =>
    forceLocalConversationId ? conversationId : (wireConvId ?? conversationId);
  const { events: rawEvents } = parseNdjsonStream(response);
  // When an abortController is provided, wrap the raw NDJSON iterator with
  // the stream-monitor so a silent server (headers-only-then-nothing, dead
  // TCP socket, tab-sleep induced stall) throws HeartbeatTimeoutError and
  // aborts the fetch instead of hanging forever.
  const events = abortController
    ? monitorStream(rawEvents, {
        heartbeatTimeoutMs,
        maxLifetimeMs,
        abortController,
      })
    : rawEvents;

  const jsonTracker = jsonExtraction?.enabled
    ? new StreamingJsonTracker({
        maxResults: jsonExtraction.maxResults,
        fuzzyOnFinalize: jsonExtraction.fuzzyOnFinalize ?? true,
      })
    : null;
  let lastJsonRevision = 0;

  let cxConversationConfirmed = false;
  let tokenUsage: { input: number; output: number; total: number } | undefined;
  let finishReason: string | undefined;
  let completionStats: CompletionStats | undefined;

  // Server-assigned ids captured from `record_reserved` events. Threaded into
  // the commit path so the final assistant turn (and any DB-faithful mirror)
  // use the server ids — never fake client-generated ones.
  //
  // The server may reserve more than one assistant cx_message per stream when
  // a turn spans multiple LLM iterations (each iteration's output lands as a
  // separate cx_message row in the DB). We track ALL of them in order so the
  // end-of-stream commit can route each iteration's content to the correct
  // messageId. Single-reservation streams trivially collapse to one entry.
  const reservedAssistantTurns: Array<{ messageId: string; position: number }> =
    [];

  let reservedUserRequestId: string | null = null;

  // Maps the provider's opaque `call_id` (used by activeRequests.toolLifecycle)
  // to the DB-side `cx_tool_call.id` (used by observability.toolCalls). Both
  // ids are known at `record_reserved cx_tool_call` time — we just need to
  // remember the association so that when the live-stream tool_event fires
  // later (keyed by call_id) we can patch the right observability row.
  const toolCallIdByProviderCallId = new Map<string, string>();

  let clientFirstChunkAt: number | null = null;
  let totalEvents = 0;
  let chunkEvents = 0;
  let reasoningChunkEvents = 0;
  let phaseEvents = 0;
  let initEvents = 0;
  let completionEvents = 0;
  let dataEvents = 0;
  let toolEvents = 0;
  let renderBlockEvents = 0;
  let warningEvents = 0;
  let infoEvents = 0;
  let recordReservedEvents = 0;
  let recordUpdateEvents = 0;
  let resourceChangedEvents = 0;
  let otherEvents = 0;

  let isInTextRun = false;
  let isInReasoningRun = false;
  let unknownEvents = 0;

  StreamProfiler.getInstance().start(requestId);

  const blockAccumulator = new StreamBlockAccumulator(
    requestId,
    upsertRenderBlock,
  );

  let textBuffer = "";
  let reasoningBuffer = "";
  let rafHandle: number | null = null;
  let pendingJsonState: { results: any[]; revision: number } | null = null;

  const dispatchBatch = () => {
    if (rafHandle !== null) {
      if (typeof window !== "undefined" && window.cancelAnimationFrame) {
        cancelAnimationFrame(rafHandle);
      } else {
        clearTimeout(rafHandle);
      }
      rafHandle = null;
    }

    if (textBuffer.length > 0) {
      const flushed = textBuffer;
      dispatch(appendChunk({ requestId, content: flushed }));
      blockAccumulator.ingest(flushed, dispatch);
      textBuffer = "";
    }
    // appendChunk now only increments chunkCount and sets firstChunkAt.
    // The actual text content is written exclusively via blockAccumulator → upsertRenderBlock.
    if (reasoningBuffer.length > 0) {
      dispatch(appendReasoningChunk({ requestId, content: reasoningBuffer }));
      reasoningBuffer = "";
    }
    if (pendingJsonState !== null) {
      dispatch(
        updateExtractedJson({
          requestId,
          results: pendingJsonState.results,
          revision: pendingJsonState.revision,
          isComplete: false,
        }),
      );
      pendingJsonState = null;
    }
  };

  const scheduleBatchEvent = () => {
    if (rafHandle === null) {
      // Throttling down to ~30fps (30ms delay) rather than rAF's 60fps (16ms)
      // because feeding 12,000 character strings to react-markdown 60x a second
      // will mathematically freeze the browser main thread.
      rafHandle = setTimeout(dispatchBatch, 30) as any;
    }
  };

  for await (const event of events) {
    totalEvents++;
    const now = performance.now();
    if (onEvent) {
      try {
        onEvent(event);
      } catch {
        /* heartbeat observer must never break the stream */
      }
    }

    // Chunk and reasoning_chunk are the hot path (thousands per stream).
    // They skip appendRawEvent — their data lives in textChunks/reasoningChunks.
    // Using the type guards directly preserves TypeScript narrowing on event.data.

    if (isChunkEvent(event)) {
      StreamProfiler.getInstance().trackChunk();
      chunkEvents++;
      if (clientFirstChunkAt === null) clientFirstChunkAt = now;
      const text = event.data.text;

      if (isInReasoningRun) {
        dispatchBatch();
        isInReasoningRun = false;
        dispatch(closeReasoningRun({ requestId, timestamp: now }));
      }

      if (!isInTextRun) {
        isInTextRun = true;
        dispatch(markTextStreamStart({ requestId, timestamp: now }));
      }

      textBuffer += text;

      if (jsonTracker) {
        const jsonState = jsonTracker.append(text);
        if (jsonState.revision !== lastJsonRevision) {
          lastJsonRevision = jsonState.revision;
          pendingJsonState = {
            results: jsonState.results.map(toSnapshot),
            revision: jsonState.revision,
          };
        }
      }

      scheduleBatchEvent();
      continue;
    }

    if (isReasoningChunkEvent(event)) {
      reasoningChunkEvents++;
      const text = event.data.text;

      if (isInTextRun) {
        dispatchBatch();
        isInTextRun = false;
      }

      if (!isInReasoningRun) {
        isInReasoningRun = true;
        dispatch(markReasoningStreamStart({ requestId, timestamp: now }));
      }

      reasoningBuffer += text;
      scheduleBatchEvent();
      continue;
    }

    // All non-chunk events: flush pending text first to preserve chronological order
    dispatchBatch();

    dispatch(
      appendRawEvent({
        requestId,
        event: {
          idx: totalEvents,
          timestamp: now,
          eventType: event.event,
          data: event.data,
        },
      }),
    );

    if (isInTextRun) {
      isInTextRun = false;
    }
    if (isInReasoningRun) {
      isInReasoningRun = false;
      dispatch(closeReasoningRun({ requestId, timestamp: now }));
    }

    if (isPhaseEvent(event)) {
      phaseEvents++;
      dispatch(setCurrentPhase({ requestId, phase: event.data.phase }));
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "phase",
            seq: 0,
            timestamp: now,
            data: event.data,
          },
        }),
      );
    } else if (isInitEvent(event)) {
      initEvents++;
      const d = event.data;
      dispatch(
        trackOperationInit({
          requestId,
          operationId: d.operation_id,
          operation: d.operation,
          parentOperationId: d.parent_operation_id,
          timestamp: now,
        }),
      );
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "init",
            seq: 0,
            timestamp: now,
            data: d,
          },
        }),
      );
    } else if (isCompletionEvent(event)) {
      completionEvents++;
      const d = event.data;
      const result = (d.result ?? {}) as Record<string, unknown>;

      dispatch(
        trackOperationCompletion({
          requestId,
          operationId: d.operation_id,
          operation: d.operation,
          status: d.status,
          result,
          timestamp: now,
        }),
      );

      if (d.operation === "user_request") {
        dispatch(setCompletion({ requestId, data: d }));

        completionStats = result as CompletionStats;

        const totals = completionStats.total_usage?.total;
        if (totals) {
          tokenUsage = {
            input: totals.input_tokens ?? 0,
            output: totals.output_tokens ?? 0,
            total: totals.total_tokens ?? 0,
          };
        }
        finishReason = completionStats.finish_reason ?? undefined;
      }

      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "completion",
            seq: 0,
            timestamp: now,
            data: d,
          },
        }),
      );
    } else if (isTypedDataEvent(event)) {
      dataEvents++;
      const d = event.data;
      const dataType = d.type ?? "unknown";

      dispatch(appendDataPayload({ requestId, data: d }));

      if (d.type === "conversation_id") {
        const convData = d as ConversationIdData;
        // Manual mode mints a fresh wire conv_id per call; the assertion
        // does not apply (the IDs are intentionally different).
        if (!forceLocalConversationId) {
          assertConversationIdMatches(
            conversationId,
            convData.conversation_id,
            "conversation_id-data-event",
          );
        }
      } else if (d.type === "conversation_labeled") {
        const labeled = d as ConversationLabeledData;
        dispatch(
          setConversationLabel({
            conversationId,
            title: labeled.title,
            description: labeled.description ?? null,
            keywords: labeled.keywords ?? null,
          }),
        );
        dispatch(
          patchAgentConversationMetadata({
            conversationId: labeled.conversation_id,
            title: labeled.title,
            description: labeled.description ?? "",
          }),
        );
      } else if (d.type === "memory_context_injected") {
        // Observational Memory: the Observer's distilled context was injected
        // into the prompt prior to this turn. Record for the live activity
        // panel + counter aggregation.
        dispatch(
          recordContextInjected({
            conversationId,
            requestId,
            data: d as MemoryContextInjectedData,
          }),
        );
      } else if (d.type === "memory_observer_completed") {
        dispatch(
          recordObserverCompleted({
            conversationId,
            requestId,
            data: d as MemoryObserverCompletedData,
          }),
        );
      } else if (d.type === "memory_reflector_completed") {
        dispatch(
          recordReflectorCompleted({
            conversationId,
            requestId,
            data: d as MemoryReflectorCompletedData,
          }),
        );
      } else if (d.type === "memory_buffer_spawned") {
        dispatch(
          recordBufferSpawned({
            conversationId,
            requestId,
            data: d as MemoryBufferSpawnedData,
          }),
        );
      } else if (d.type === "memory_error") {
        // Non-fatal: memory failures must never break the assistant turn.
        // Flag `degraded` on the slice so the UI can show a subtle badge
        // without interrupting the conversation.
        dispatch(
          recordMemoryError({
            conversationId,
            requestId,
            data: d as MemoryErrorData,
          }),
        );
      } else if (isMediaBlockData(d)) {
        // ── Phase 0 canonical path ─────────────────────────────────────────
        // Python's new `media_block` event carries the full
        // `UnifiedMediaBlock` shape on `data.block`. Lift to our domain
        // shape via the single canonical adapter and route by `kind`.
        //
        // Each kind maps to the same legacy render-block type the FE
        // already consumed (`image_output` / `audio_output` / `video_output`)
        // so existing renderers and selectors keep working without churn.
        // When `kind: "document"` or `kind: "youtube"` arrives we use the
        // generic `media_block` type and rely on the renderer to dispatch
        // on `block.data.kind`.
        //
        // See docs/PYTHON_UPDATES.md §2 for the wire contract.
        const unified: UnifiedMediaBlock = fromMediaBlock(d.block);
        const isStreamingPartial = unified.status === "streaming";

        const renderBlockType =
          unified.kind === "image"
            ? "image_output"
            : unified.kind === "audio"
              ? "audio_output"
              : unified.kind === "video"
                ? "video_output"
                : "media_block";

        // Partials + finals collapse onto one render block per stream
        // so the renderer never sees flicker. Image keeps the legacy
        // `image_block_current` key so it shares state with the
        // `image_output` / `partial_image` legacy adapters during the
        // transition window. Other kinds use a kind-keyed stable id so
        // multiple in-flight audio/video clips can stream side by side.
        const stableKey =
          unified.kind === "image"
            ? "image_block_current"
            : `media_block_${unified.kind}_current`;

        dispatch(
          upsertRenderBlock({
            requestId,
            block: {
              blockId: stableKey,
              blockIndex: renderBlockEvents,
              type: renderBlockType,
              status: isStreamingPartial ? "streaming" : "complete",
              content: null,
              data: unified as unknown as Record<string, unknown>,
            },
          }),
        );

        // Open the image peek overlay on a FINAL image arrival. Skip on
        // streaming partials (would flash too early) and on non-image kinds
        // (the peek host is image-only today).
        if (unified.kind === "image" && !isStreamingPartial) {
          dispatch(openOverlay({ overlayId: "imagePeekHost" }));
        }
      } else {
        const blockType = [
          "audio_output",
          "image_output",
          "video_output",
          "search_results",
          "search_error",
          "function_result",
          "workflow_step",
          "categorization_result",
          "fetch_results",
          "podcast_complete",
          "podcast_stage",
          "scrape_batch_complete",
          "structured_input_warning",
          "display_questionnaire",
        ].includes(dataType)
          ? dataType
          : "unknown_data_event";

        // ── Legacy fallback path ──────────────────────────────────────────
        // Backed by `image_output` / `partial_image` / `audio_output` /
        // `video_output` events from un-redeployed services. Will retire
        // once Python's `media_block` rollout completes (~one release
        // cycle after deploy).
        let blockData: Record<string, unknown>;
        if (dataType === "image_output") {
          const unified: UnifiedImageBlock = fromImageOutputData(
            d as ImageOutputData,
            ((d as unknown as Record<string, unknown>).metadata as
              | Record<string, unknown>
              | undefined) ?? null,
          );
          blockData = unified as unknown as Record<string, unknown>;
        } else if (dataType === "partial_image") {
          const unified: UnifiedImageBlock = fromPartialImageData(
            d as PartialImageData,
          );
          blockData = unified as unknown as Record<string, unknown>;
        } else if (blockType === "unknown_data_event") {
          blockData = { ...(d as UntypedDataPayload), _dataType: dataType };
        } else {
          blockData = d as unknown as Record<string, unknown>;
        }

        // Partial images share the blockId with the eventual final image_output
        // so the upsert collapses partial + complete into one entry. The final
        // event lands with status "complete" and the URL fields populated; the
        // partial leaves only base64 + status "streaming".
        const partialKey =
          dataType === "partial_image" || dataType === "image_output"
            ? "image_block_current"
            : undefined;
        const blockId = partialKey ?? `data_${dataType}_${totalEvents}`;
        const finalBlockType =
          dataType === "partial_image" ? "image_output" : blockType;

        dispatch(
          upsertRenderBlock({
            requestId,
            block: {
              blockId,
              blockIndex: renderBlockEvents,
              type: finalBlockType,
              status: dataType === "partial_image" ? "streaming" : "complete",
              content: null,
              data: blockData,
            },
          }),
        );

        // Open the image peek notification overlay when a FINAL image arrives.
        // Skip on partials — the overlay would flash too early.
        if (dataType === "image_output") {
          dispatch(openOverlay({ overlayId: "imagePeekHost" }));
        }
      }

      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "data",
            seq: 0,
            timestamp: now,
            data: d,
          },
        }),
      );
    } else if (isToolEventEvent(event)) {
      toolEvents++;
      const toolData = event.data;

      if (toolData.event === "tool_delegated") {
        dispatch(
          addPendingToolCall({
            requestId,
            toolCall: {
              callId: toolData.call_id,
              toolName: toolData.tool_name,
              arguments: (toolData.data as Record<string, unknown>) ?? {},
            },
          }),
        );
        dispatch(
          upsertToolLifecycle({
            requestId,
            callId: toolData.call_id,
            toolName: toolData.tool_name,
            status: "started",
            arguments: (toolData.data as Record<string, unknown>) ?? {},
            isDelegated: true,
            event: toolData,
          }),
        );

        if (isWidgetActionName(toolData.tool_name)) {
          // Widget actions resolve fast and fire-and-forget from the stream's
          // POV — the microtask batcher posts results back so the server can
          // resume without us having to flip the instance to "paused".
          dispatch(
            dispatchWidgetAction({
              conversationId,
              requestId,
              callId: toolData.call_id,
              toolName: toolData.tool_name as WidgetActionName,
              args:
                ((toolData.data as Record<string, unknown>)
                  ?.arguments as Record<string, unknown>) ?? {},
            }),
          );
        } else if (isUiFirstToolName(toolData.tool_name)) {
          // UI-first tools (user / update_plan / tasks / user_todos /
          // request_user_takeover / memory / storage). The dispatcher
          // validates args via Zod, runs the handler (which may await user
          // input for ask-user-tier tools), and POSTs the result. We don't
          // pause the instance — the server simply waits for tool_results
          // before emitting more chunks.
          dispatch(
            dispatchUiFirstTool({
              conversationId,
              requestId,
              callId: toolData.call_id,
              toolName: toolData.tool_name,
              args:
                ((toolData.data as Record<string, unknown>)
                  ?.arguments as Record<string, unknown>) ?? {},
            }),
          );
        } else {
          // Non-widget delegated tool — preserve the legacy pause for any
          // server-coordinated flow that still expects the client to
          // suspend the instance while it executes.
          dispatch(setInstanceStatus({ conversationId, status: "paused" }));
        }
      } else {
        const lifecycleStatus = toolData.event.replace(
          "tool_",
          "",
        ) as ToolLifecycleStatus;

        dispatch(
          upsertToolLifecycle({
            requestId,
            callId: toolData.call_id,
            toolName: toolData.tool_name,
            status: lifecycleStatus,
            message: toolData.message,
            data: toolData.data as Record<string, unknown> | null,
            event: toolData,
            ...(toolData.event === "tool_completed" && {
              result: (toolData.data as Record<string, unknown>)?.result,
            }),
            ...(toolData.event === "tool_result_preview" && {
              resultPreview: (toolData.data as Record<string, unknown>)
                ?.preview as string | undefined,
            }),
            ...(toolData.event === "tool_error" && {
              errorType: (toolData.data as Record<string, unknown>)
                ?.error_type as string | undefined,
              errorMessage: toolData.message,
            }),
          }),
        );
      }

      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "tool_event",
            seq: 0,
            timestamp: now,
            data: toolData,
          },
        }),
      );
    } else if (isRenderBlockEvent(event)) {
      renderBlockEvents++;
      // Image render_blocks (markdown-parsed `![alt](url)`) flow through the
      // canonical UnifiedImageBlock adapter so the rest of the system sees
      // the same shape as data-event image_output blocks. The adapter takes
      // the loose `RenderBlockPayload` directly and validates internally —
      // no force-cast to `ImageRenderBlock` needed.
      let block = event.data;
      if (block.type === "image") {
        const unified = fromRenderBlock(block);
        block = {
          ...block,
          type: "image_output",
          data: unified as unknown as Record<string, unknown>,
        };
      }
      dispatch(
        upsertRenderBlock({
          requestId,
          block,
        }),
      );
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "render_block",
            seq: 0,
            timestamp: now,
            data: event.data,
          },
        }),
      );
    } else if (isWarningEvent(event)) {
      warningEvents++;
      dispatch(addWarning({ requestId, warning: event.data }));
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "warning",
            seq: 0,
            timestamp: now,
            data: event.data,
          },
        }),
      );
    } else if (isInfoEvent(event)) {
      infoEvents++;
      dispatch(addInfoEvent({ requestId, info: event.data }));
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "info",
            seq: 0,
            timestamp: now,
            data: event.data,
          },
        }),
      );
    } else if (isRecordReservedEvent(event)) {
      recordReservedEvents++;
      const d = event.data;
      dispatch(
        upsertReservation({
          requestId,
          recordId: d.record_id,
          dbProject: d.db_project,
          table: d.table,
          status: "pending",
          parentRefs: d.parent_refs,
          metadata: d.metadata,
        }),
      );

      // ── Per-table dispatch into the DB-faithful slices ─────────────────
      //
      // record_reserved arrives BEFORE any content lands. We seed:
      //   • messages.byId[record_id]     with status "reserved" (empty content)
      //   • observability.userRequests   (cx_user_request)
      //   • observability.requests       (cx_request)
      //   • observability.toolCalls      (cx_tool_call)
      //
      // The content of an assistant message is committed later in the
      // `completion` / `end` path via `updateMessageRecord`, which writes
      // the final `CxContentBlock[]` into the same `byId` slot. Live
      // stream writes here are metadata-only — no re-render storm on the
      // message body.
      if (isCxMessageReservation(d)) {
        // Tool-role cx_message rows are stubs that pair an assistant tool_call
        // with its tool_result; the actual tool data lives in cx_tool_call
        // (observability.toolCalls). Reserving them in messages.byId pollutes
        // the transcript with empty assistant bubbles once record_update flips
        // their status off "reserved" — skip the reservation entirely. The
        // observability.toolCalls path is the canonical home for tool data.
        if (d.metadata.role !== "tool") {
          const { position, role } = d.metadata;
          const owningConversationId = owningConvId(
            d.parent_refs.conversation_id,
          );

          if (role === "user" && userMessageClientTempId) {
            // Promote the optimistic user record to the server id. The record
            // already carries the user's content, so no further patch needed
            // here — the stream just swaps the key.
            dispatch(
              promoteMessageId({
                conversationId: owningConversationId,
                oldId: userMessageClientTempId,
                newId: d.record_id,
                position,
              }),
            );
          } else {
            // Stash the live requestId on the reserved record so the
            // renderer keeps reading from `activeRequests.byRequestId[reqId]`
            // for the entire conversation lifetime — even AFTER this stream
            // completes. Without this anchor, AgentAssistantMessage would
            // flip to the DB-content path the moment the stream ended,
            // causing a full re-render of the response column.
            dispatch(
              reserveMessage({
                conversationId: owningConversationId,
                messageId: d.record_id,
                role,
                position,
                requestId,
              }),
            );
          }

          if (role === "assistant") {
            reservedAssistantTurns.push({
              messageId: d.record_id,
              position,
            });
          }
        }
      } else if (d.table === "cx_user_request") {
        reservedUserRequestId = d.record_id;
        const parents = d.parent_refs as
          | { conversation_id?: string }
          | undefined;
        const nowIso = new Date().toISOString();
        // Phase 2 — server has persisted the user's request. Safe to visually
        // clear the input field; lastSubmittedText is retained in the slice.
        dispatch(markInputPersisted(conversationId));
        dispatch(
          upsertUserRequest({
            id: d.record_id,
            conversationId: owningConvId(parents?.conversation_id),
            // Fields unknown at reservation time; server fills them in on
            // record_update / completion. Sensible zeros keep selectors safe.
            userId: "",
            agentId: null,
            agentVersionId: null,
            status: "pending",
            iterations: 0,
            finishReason: null,
            error: null,
            triggerMessagePosition: null,
            resultStartPosition: null,
            resultEndPosition: null,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCachedTokens: 0,
            totalTokens: 0,
            totalToolCalls: 0,
            totalCost: null,
            totalDurationMs: null,
            apiDurationMs: null,
            toolDurationMs: null,
            sourceApp: "",
            sourceFeature: "",
            metadata: (d.metadata ?? {}) as CxUserRequestRecord["metadata"],
            createdAt: nowIso,
            completedAt: null,
            deletedAt: null,
          }),
        );
      } else if (isCxRequestReservation(d)) {
        const { iteration } = d.metadata;
        const { conversation_id, user_request_id } = d.parent_refs;
        const nowIso = new Date().toISOString();
        dispatch(
          upsertRequest({
            id: d.record_id,
            conversationId: owningConvId(conversation_id),
            userRequestId: user_request_id,
            aiModelId: "",
            apiClass: null,
            iteration,
            responseId: null,
            finishReason: null,
            inputTokens: null,
            cachedTokens: null,
            outputTokens: null,
            totalTokens: null,
            cost: null,
            totalDurationMs: null,
            apiDurationMs: null,
            toolDurationMs: null,
            toolCallsCount: null,
            toolCallsDetails: null,
            metadata: (d.metadata ?? {}) as CxRequestRecord["metadata"],
            createdAt: nowIso,
            deletedAt: null,
          }),
        );
      } else if (isCxToolCallReservation(d)) {
        const { tool_name, call_id, iteration } = d.metadata;
        const {
          conversation_id,
          user_request_id,
          call_id: parentCallId,
        } = d.parent_refs;
        const nowIso = new Date().toISOString();
        // Record the call_id → DB id mapping so tool_event patches land on
        // the correct observability row.
        const providerCallId = call_id ?? parentCallId;
        if (providerCallId) {
          toolCallIdByProviderCallId.set(providerCallId, d.record_id);
        }
        dispatch(
          upsertToolCall({
            id: d.record_id,
            conversationId: owningConvId(conversation_id),
            userRequestId: user_request_id,
            messageId: null,
            userId: "",
            callId: call_id ?? parentCallId,
            toolName: tool_name,
            // Streamed events carry the canonical name; the as-called value is
            // backfilled on conversation reload from cx_tool_call.tool_name_as_called.
            toolNameAsCalled: null,
            toolType: "",
            iteration,
            status: "pending",
            success: false,
            isError: null,
            errorType: null,
            errorMessage: null,
            arguments: {} as CxToolCallRecord["arguments"],
            output: null,
            outputChars: 0,
            outputPreview: null,
            outputType: null,
            inputTokens: null,
            outputTokens: null,
            totalTokens: null,
            costUsd: null,
            durationMs: 0,
            startedAt: nowIso,
            completedAt: nowIso,
            parentCallId: null,
            retryCount: null,
            persistKey: null,
            filePath: null,
            executionEvents: null,
            metadata: (d.metadata ?? {}) as CxToolCallRecord["metadata"],
            createdAt: nowIso,
            deletedAt: null,
          }),
        );
      } else if (d.table === "cx_conversation") {
        // Manual mode: wire convId ≠ local Redux convId by design. The
        // server-side cx_conversation row is keyed by a different id than
        // our local Redux conversationId, so the local id is NOT a valid
        // list-row id and must never be written into the per-agent
        // conversation list cache. Doing so pollutes the cache with rows
        // whose ids don't exist server-side (loadConversation fails) AND
        // flips the cache status to "succeeded", which suppresses the
        // real `get_agent_conversations` RPC on the run page's sidebar.
        // Both the assertion and the list-cache upsert are therefore
        // gated on agent mode.
        if (!forceLocalConversationId) {
          assertConversationIdMatches(
            conversationId,
            d.record_id,
            "record_reserved-cx_conversation",
          );
          if (!cxConversationConfirmed) {
            cxConversationConfirmed = true;
            dispatch(confirmServerSync(conversationId));
            const syncListCx = upsertAgentConversationFromExecutionAction(
              getState(),
              conversationId,
              conversationId,
            );
            if (syncListCx) dispatch(syncListCx);
          }
        }
      }

      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "record_reserved",
            seq: 0,
            timestamp: now,
            data: d,
          },
        }),
      );
    } else if (isRecordUpdateEvent(event)) {
      recordUpdateEvents++;
      const d = event.data;
      dispatch(
        upsertReservation({
          requestId,
          recordId: d.record_id,
          dbProject: d.db_project,
          table: d.table,
          status: d.status,
          metadata: d.metadata,
        }),
      );

      // Per-table status patch into the DB-faithful slices. These updates
      // deliberately ONLY touch the `status` field — never content —
      // so subscribers rendering message bodies don't re-render on
      // bookkeeping status changes. (See Phase 5.3 re-render audit.)
      if (d.table === "cx_message") {
        dispatch(
          updateMessageRecord({
            conversationId,
            messageId: d.record_id,
            // On a failed transition, carry the metadata through too so the
            // in-session record reflects { failed:true, error } exactly as
            // the DB serves it back on reload — the failed-turn renderer
            // reads `metadata.error`. Non-failed transitions stay status-only
            // to avoid re-rendering message bodies on bookkeeping changes.
            patch:
              d.status === "failed" && d.metadata
                ? {
                    status: d.status,
                    metadata: d.metadata as MessageRecord["metadata"],
                  }
                : { status: d.status },
          }),
        );
      } else if (d.table === "cx_user_request") {
        dispatch(
          patchUserRequest({
            id: d.record_id,
            patch: {
              status: d.status,
              completedAt:
                d.status === "completed" || d.status === "failed"
                  ? new Date().toISOString()
                  : null,
            },
          }),
        );
      } else if (d.table === "cx_tool_call") {
        // Stamp `completedAt` whenever the tool-call record transitions —
        // "active" / "completed" / "failed" all mark the row as no longer
        // reserved and give us the server's timestamp.
        dispatch(
          patchToolCall({
            id: d.record_id,
            patch: {
              status: d.status,
              completedAt: new Date().toISOString(),
            },
          }),
        );
      }

      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "record_update",
            seq: 0,
            timestamp: now,
            data: d,
          },
        }),
      );
    } else if (isResourceChangedEvent(event)) {
      // Generic "this resource just changed" primitive. Today it's emitted
      // by matrx-ai's `fs_write` / `fs_patch` / `fs_mkdir` tools (kind
      // `fs.file` / `fs.directory`) and by the orchestrator when the
      // active tool set mutates mid-loop (kind `active_tools` — fired by
      // tools that load other tools, e.g. the Chrome-extension discovery
      // tool). Future kinds (`cld_files`, `sandbox.cwd`, `cache.*`) will
      // land on the same wire shape. The fs slice swallows ALL kinds;
      // downstream consumers branch on `kind` and ignore unknown ones —
      // see `features/code/SANDBOX_PROXY_AND_FS_EVENTS_FE_INTEGRATION.md` §2.
      resourceChangedEvents++;
      const d = event.data;
      if (d.kind === "active_tools") {
        // Tool set was invalidated by a mid-loop injection. Bump the
        // per-conversation revision so any toolbar / capability-display UI
        // bound to the active set refetches. `metadata.added/removed` carry
        // the deltas — surfaced for UX hints (toast, badge, etc.).
        const added =
          typeof d.metadata?.added === "number" ? d.metadata.added : 0;
        const removed =
          typeof d.metadata?.removed === "number" ? d.metadata.removed : 0;
        dispatch(invalidateActiveTools({ conversationId, added, removed }));
      } else {
        dispatch(
          receivedFsChange({
            kind: d.kind,
            action: d.action,
            resourceId: d.resource_id,
            sandboxId: d.sandbox_id ?? null,
            userId: d.user_id ?? null,
            metadata: d.metadata ?? {},
            receivedAt: Date.now(),
            requestId,
            conversationId,
          }),
        );
      }
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "resource_changed",
            seq: 0,
            timestamp: now,
            data: d,
          },
        }),
      );
    } else if (isErrorEvent(event)) {
      otherEvents++;
      // Pass the backend ErrorPayload through verbatim — both
      // `message` (system / technical) and `user_message` (optional
      // human-friendly) survive intact. Consumers decide which one to
      // surface; we never collapse them into a single field here. There
      // is no `is_fatal` field on the wire — error events ARE fatal by
      // definition (the stream is killed); the client tracks that solely
      // through `request.status === "error"`.
      dispatch(
        setRequestStatus({
          requestId,
          status: "error",
          error: event.data,
        }),
      );
      dispatch(setInstanceStatus({ conversationId, status: "error" }));
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "error",
            seq: 0,
            timestamp: now,
            data: event.data,
          },
        }),
      );

      // Widget handle lifecycle: fire onError at stream-level errors too,
      // not only for widget_* tool failures (dispatcher fires those already).
      const errWidgetHandleId = selectWidgetHandleIdFor(
        getState(),
        conversationId,
      );
      if (errWidgetHandleId) {
        const handle = callbackManager.get<WidgetHandle>(errWidgetHandleId);
        handle?.onError?.({
          reason: event.data.error_type ?? "stream_error",
          message: event.data.user_message ?? event.data.message,
        });
      }
    } else if (isEndEvent(event)) {
      otherEvents++;
      const currentState = getState();
      const currentRequest = currentState.activeRequests.byRequestId[requestId];
      if (currentRequest?.status !== "error") {
        dispatch(setRequestStatus({ requestId, status: "complete" }));
        // Don't overwrite a `paused` instance — the backend hard-suspends and
        // ends the stream when a client-tool is pending, but the instance is
        // genuinely still waiting on the user. The /tool_results POST →
        // resumeInstance handoff flips it back to "running". Keeping the
        // REQUEST at "complete" is correct (this stream did end); the INSTANCE
        // tracks the conversation lifecycle, which is still mid-flight.
        const instStatus =
          currentState.conversations.byConversationId[conversationId]?.status;
        if (instStatus !== "paused") {
          dispatch(setInstanceStatus({ conversationId, status: "complete" }));
        }

        // Widget handle lifecycle: fire onComplete at stream end (success
        // path only). Fires for EVERY display mode — the previous call site
        // in launch-agent-execution.thunk.ts:439 only fired in the narrow
        // autoRun + direct/background/inline branch.
        const endWidgetHandleId = selectWidgetHandleIdFor(
          getState(),
          conversationId,
        );
        if (endWidgetHandleId) {
          const handle = callbackManager.get<WidgetHandle>(endWidgetHandleId);
          if (handle?.onComplete) {
            const responseText =
              currentRequest?.renderBlockOrder
                .map((id) => currentRequest.renderBlocks[id]?.content ?? "")
                .join("\n") || "";
            handle.onComplete({
              conversationId,
              requestId,
              responseText,
            });
          }
        }
      }
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "end",
            seq: 0,
            timestamp: now,
            data: event.data,
          },
        }),
      );
    } else if (isBrokerEvent(event)) {
      otherEvents++;
      dispatch(
        appendDataPayload({
          requestId,
          data: { type: "broker", broker: event.data } as UntypedDataPayload,
        }),
      );
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "broker",
            seq: 0,
            timestamp: now,
            data: event.data,
          },
        }),
      );
    } else if (isHeartbeatEvent(event)) {
      otherEvents++;
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "heartbeat",
            seq: 0,
            timestamp: now,
            data: event.data,
          },
        }),
      );
    } else if (isContextAnalysisEvent(event)) {
      otherEvents++;
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "unknown",
            seq: 0,
            timestamp: now,
            originalEvent: "context_analysis",
            rawData: event.data,
          },
        }),
      );
    } else if (isStructuredOutputEvent(event)) {
      otherEvents++;
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "structured_output",
            seq: 0,
            timestamp: now,
            data: event.data,
          },
        }),
      );
    } else if (isContextStateEvent(event)) {
      otherEvents++;
      // Wire payload is snake_case + uses Record<string, unknown> for
      // JSONB-shaped fields (matches generated stream-events.ts). The
      // slice's ContextStateWirePayload accepts that shape directly and
      // narrows to typed fields inside the reducer — no cast needed here.
      dispatch(applyContextState(event.data));
    } else if (isContextTrimmedEvent(event)) {
      otherEvents++;
      dispatch(applyContextTrimmed(event.data));
    } else if (isInjectionConsumedEvent(event)) {
      otherEvents++;
      // Inbox delivery ack — full queued→delivered UI lands with turn-boundary
      // inbox work; preserve the payload on the timeline until then.
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "unknown",
            seq: 0,
            timestamp: now,
            originalEvent: "injection_consumed",
            rawData: event.data,
          },
        }),
      );
    } else {
      const _exhaustive: never = event;
      const unhandled = _exhaustive as { event?: string; data?: unknown };
      unknownEvents++;
      otherEvents++;
      console.warn(
        `[stream:${requestId.slice(0, 8)}] Unrecognized event type: "${unhandled.event}"`,
        unhandled,
      );
      dispatch(
        appendTimeline({
          requestId,
          entry: {
            kind: "unknown",
            seq: 0,
            timestamp: now,
            originalEvent: String(unhandled.event ?? "undefined"),
            rawData: unhandled.data,
          },
        }),
      );
    }
  }

  if (unknownEvents > 0) {
    console.warn(
      `[stream:${requestId.slice(0, 8)}] Stream completed with ${unknownEvents} unrecognized event(s)`,
    );
  }

  // Final flush of any trailing buffers after the loop ends
  dispatchBatch();
  blockAccumulator.finalize(dispatch);

  if (isInTextRun) {
    dispatch(closeTextRun({ requestId, timestamp: performance.now() }));
  }
  if (isInReasoningRun) {
    dispatch(closeReasoningRun({ requestId, timestamp: performance.now() }));
  }

  StreamProfiler.getInstance().stopAndReport("Stream Performance Result", {
    tokens: tokenUsage,
    timing: completionStats?.timing_stats,
  });

  const postLoopState = getState();
  const postLoopRequest = postLoopState.activeRequests.byRequestId[requestId];
  if (
    postLoopRequest &&
    postLoopRequest.status !== "complete" &&
    postLoopRequest.status !== "error"
  ) {
    dispatch(setRequestStatus({ requestId, status: "complete" }));
    // Same guard as the isEndEvent branch above — don't overwrite a `paused`
    // instance that ended because the loop hard-suspended awaiting a client
    // tool answer (see CLIENT_TOOL_SUSPEND_RESUME.md).
    const postLoopInstStatus =
      postLoopState.conversations.byConversationId[conversationId]?.status;
    if (postLoopInstStatus !== "paused") {
      dispatch(setInstanceStatus({ conversationId, status: "complete" }));
    }
  }

  const streamEndAt = performance.now();

  dispatch(finalizeAccumulatedReasoning({ requestId }));

  if (jsonTracker) {
    const finalJsonState = jsonTracker.finalize();
    dispatch(
      updateExtractedJson({
        requestId,
        results: finalJsonState.results.map(toSnapshot),
        revision: finalJsonState.revision,
        isComplete: true,
      }),
    );
  }

  const finalState = getState();
  const finalRequest = finalState.activeRequests.byRequestId[requestId];
  // For DB persistence we want the human-friendly summary (`user_message` if
  // the backend sent one, otherwise the technical `message`). The full
  // `ErrorPayload` lives on `finalRequest.error` for in-memory consumers.
  const finalErrorMessage =
    finalRequest?.status === "error" && finalRequest.error
      ? (finalRequest.error.user_message ?? finalRequest.error.message ?? null)
      : null;

  // Assemble the DB-compatible CxContentBlock[] from the completed request.
  // This is the single source of truth for the persisted assistant content —
  // exactly what cx_message.content stores. We write it to messages.byId
  // (keyed by the server-assigned cx_message.id reserved earlier in the
  // stream) via `updateMessageRecord`. No parallel legacy path.
  const cxContentBlocks = finalRequest
    ? assembleMessageParts(finalRequest)
    : [];

  // tool_result content blocks belong to the DB's role:"tool" cx_message rows,
  // NOT to the assistant turns. Strip them before committing to any assistant
  // messageId — the canonical render selector reads tool results from
  // observability.toolCalls (joined by callId) at display time.
  const assistantBlocks = cxContentBlocks.filter(
    (b) => (b as { type?: string }).type !== "tool_result",
  );

  // Sort reservations by DB position (matches the iteration order on the
  // server side: each new iteration's assistant output lands at a higher
  // position than the previous).
  const sortedTurns = [...reservedAssistantTurns].sort(
    (a, b) => a.position - b.position,
  );

  if (sortedTurns.length === 1) {
    // Single reservation — all assistant content lands here. Common path
    // when the server collapses a multi-iteration turn into one cx_message.
    const turn = sortedTurns[0];
    dispatch(
      updateMessageRecord({
        conversationId,
        messageId: turn.messageId,
        patch: {
          content:
            assistantBlocks as unknown as import("@/types/database.types").Json,
          status: "active",
          _clientStatus: finalErrorMessage ? "error" : "complete",
          position: turn.position,
        },
      }),
    );
  } else if (sortedTurns.length > 1) {
    // Multi-reservation — partition assembled blocks by iteration. Each
    // tool_call carries an iteration on its observability record (looked up
    // via callId → uuid → cx_tool_call.iteration). Non-tool_call blocks
    // are bucketed with the iteration of the most-recently-seen tool_call;
    // trailing blocks after the last tool_call belong to the next (final)
    // iteration. Iterations are then mapped to reservations in order.
    const blocksByIter = new Map<
      number,
      Array<(typeof assistantBlocks)[number]>
    >();

    let lastToolCallIndex = -1;
    for (let i = 0; i < assistantBlocks.length; i++) {
      if ((assistantBlocks[i] as { type?: string }).type === "tool_call") {
        lastToolCallIndex = i;
      }
    }

    let currentIter = 1;
    for (let i = 0; i < assistantBlocks.length; i++) {
      const block = assistantBlocks[i];
      const blockType = (block as { type?: string }).type;
      let iter = currentIter;

      if (blockType === "tool_call") {
        // assembleMessageParts writes the lifecycle callId to the `id` field
        // (legacy CxToolCallContent shape). New persisted blocks may use
        // `call_id`. Accept both for forward compatibility.
        const tcBlock = block as { id?: string; call_id?: string };
        const callId = tcBlock.call_id ?? tcBlock.id;
        const uuid = callId
          ? toolCallIdByProviderCallId.get(callId)
          : undefined;
        const tc = uuid ? finalState.observability.toolCalls[uuid] : undefined;
        if (tc?.iteration) {
          iter = tc.iteration;
          currentIter = iter;
        }
      } else if (i > lastToolCallIndex && lastToolCallIndex >= 0) {
        // Trailing block after the last tool_call — final-response iteration.
        iter = currentIter + 1;
      }

      const list = blocksByIter.get(iter) ?? [];
      list.push(block);
      blocksByIter.set(iter, list);
    }

    const sortedIters = [...blocksByIter.keys()].sort((a, b) => a - b);
    for (let i = 0; i < sortedIters.length; i++) {
      const iter = sortedIters[i];
      const turn = sortedTurns[i];
      if (!turn) {
        console.warn(
          `[stream:${requestId.slice(0, 8)}] iteration ${iter} has no matching reservation; ${blocksByIter.get(iter)?.length ?? 0} block(s) dropped`,
        );
        continue;
      }
      dispatch(
        updateMessageRecord({
          conversationId,
          messageId: turn.messageId,
          patch: {
            content: blocksByIter.get(
              iter,
            ) as unknown as import("@/types/database.types").Json,
            status: "active",
            _clientStatus: finalErrorMessage ? "error" : "complete",
            position: turn.position,
          },
        }),
      );
    }
  }

  // Flush live tool lifecycle state into the observability slice. Each tool
  // call was reserved earlier (cx_tool_call record_reserved) so the
  // observability entries already exist — patch them now with the final
  // live-state results (output, status, duration, error info). We map
  // provider call_id → DB record_id via the map populated during the
  // reservation event.
  if (finalRequest?.toolLifecycle) {
    for (const [callId, lc] of Object.entries(finalRequest.toolLifecycle)) {
      const dbId = toolCallIdByProviderCallId.get(callId);
      if (!dbId) continue; // reservation wasn't observed — skip safely
      const startedAt = lc.startedAt ?? null;
      const completedAt = lc.completedAt ?? null;
      const durationMs =
        startedAt && completedAt
          ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
          : 0;
      const outputStr =
        lc.result !== undefined && lc.result !== null
          ? typeof lc.result === "string"
            ? lc.result
            : JSON.stringify(lc.result)
          : null;
      dispatch(
        patchToolCall({
          id: dbId,
          patch: {
            status: lc.status,
            success: lc.status === "completed",
            isError: lc.status === "error" ? true : null,
            errorType: lc.errorType ?? null,
            errorMessage: lc.errorMessage ?? null,
            arguments: (lc.arguments ?? {}) as CxToolCallRecord["arguments"],
            output: outputStr,
            outputChars: outputStr?.length ?? 0,
            outputPreview: (lc.resultPreview ??
              null) as CxToolCallRecord["outputPreview"],
            durationMs,
            ...(startedAt ? { startedAt } : {}),
            ...(completedAt ? { completedAt } : {}),
          },
        }),
      );
    }
  }

  dispatch(clearUserInput(conversationId));
  dispatch(clearAllResources(conversationId));
  dispatch(resetUserVariableValues(conversationId));

  const renderCompleteAt = performance.now();

  const internalLatencyMs =
    conversationIdAt !== null ? conversationIdAt - submitAt : null;
  const ttftMs =
    clientFirstChunkAt !== null ? clientFirstChunkAt - submitAt : null;
  const streamDurationMs =
    clientFirstChunkAt !== null ? streamEndAt - clientFirstChunkAt : null;
  const renderDelayMs = renderCompleteAt - streamEndAt;
  const totalClientDurationMs = renderCompleteAt - submitAt;

  // Derive completed text from the assembled content blocks — the active
  // request no longer stores an `accumulatedText` field (textChunks are
  // folded directly into content blocks).
  const completedText = cxContentBlocks
    .filter(
      (b): b is { type: "text"; text: string } =>
        typeof b === "object" &&
        b !== null &&
        (b as { type?: unknown }).type === "text" &&
        typeof (b as { text?: unknown }).text === "string",
    )
    .map((b) => b.text)
    .join("");
  const completedReasoning = finalRequest?.accumulatedReasoning ?? "";
  const encoder = new TextEncoder();
  const accumulatedTextBytes = encoder.encode(completedText).length;
  const totalPayloadBytes =
    accumulatedTextBytes + encoder.encode(completedReasoning).length;

  const clientMetrics: ClientMetrics = {
    submitAt,
    conversationIdAt,
    firstChunkAt: clientFirstChunkAt,
    streamEndAt,
    renderCompleteAt,
    internalLatencyMs,
    ttftMs,
    streamDurationMs,
    renderDelayMs,
    totalClientDurationMs,
    totalEvents,
    chunkEvents,
    reasoningChunkEvents,
    phaseEvents,
    initEvents,
    completionEvents,
    dataEvents,
    toolEvents,
    renderBlockEvents: renderBlockEvents,
    warningEvents,
    infoEvents,
    recordReservedEvents,
    recordUpdateEvents,
    resourceChangedEvents,
    otherEvents,
    accumulatedTextBytes,
    totalPayloadBytes,
  };

  dispatch(finalizeClientMetrics({ requestId, metrics: clientMetrics }));

  return {
    conversationId,
    completionStats,
    tokenUsage,
    finishReason,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function toSnapshot(extracted: {
  value: unknown;
  type: "object" | "array" | "primitive";
  source: "fenced" | "bare-block" | "inline" | "whole-string";
  isComplete: boolean;
  repairApplied: boolean;
  warnings: string[];
}): ExtractedJsonSnapshot {
  return {
    value: extracted.value,
    type: extracted.type,
    source: extracted.source,
    isComplete: extracted.isComplete,
    repairApplied: extracted.repairApplied,
    warnings: extracted.warnings,
  };
}
