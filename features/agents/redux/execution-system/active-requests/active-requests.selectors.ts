/**
 * Active Request Selectors
 *
 * SELECTOR RULES (same as aggregate.selectors.ts):
 * - Primitives returned directly — stable by value, safe for useAppSelector.
 * - Arrays/objects from .filter()/.map() ALWAYS wrapped in createSelector.
 * - Input selectors: plain state lookups only — no filtering, no ?? defaults.
 * - Result functions: all filtering, mapping, and derivation.
 * - No ?? [] / ?? {} / ?? null defaults in selectors — return undefined, guard in component.
 * - Every parameterized selector chains from selectRequest (the base record selector)
 *   so the shared byRequestId[id] lookup is not duplicated across the call tree.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  ActiveRequest,
  ExtractedJsonSnapshot,
  ToolLifecycleEntry,
  TimelineEntry,
  RawStreamEvent,
  ReservationRecord,
} from "@/features/agents/types/request.types";
import type {
  Phase,
  Operation,
  InitCompletionStatus,
  RenderBlockPayload,
  CompletionPayload,
  WarningPayload,
  InfoPayload,
  UserRequestResult,
  LlmRequestResult,
  ToolExecutionResult,
  SubAgentResult,
  PersistenceResult,
  TypedDataPayload,
  UntypedDataPayload,
  AudioOutputData,
  CategorizationResultData,
  ConversationIdData,
  ConversationLabeledData,
  FetchResultsData,
  FunctionResultData,
  ImageOutputData,
  PodcastCompleteData,
  PodcastStageData,
  QuestionnaireDisplayData,
  ScrapeBatchCompleteData,
  SearchErrorData,
  SearchResultsData,
  StructuredInputWarningData,
  VideoOutputData,
  WorkflowStepData,
} from "@/types/python-generated/stream-events";
import type {
  OperationEntry,
  CompletedOperationEntry,
} from "@/features/agents/types/request.types";

// =============================================================================
// Base Record Selector — all parameterized selectors chain from this
// =============================================================================

/**
 * The base record lookup. Everything else derives from this so the
 * byRequestId[id] lookup is never duplicated in input selectors.
 */
export const selectRequest =
  (requestId: string) =>
  (state: RootState): ActiveRequest | undefined =>
    state.activeRequests.byRequestId[requestId];

// =============================================================================
// Core Request Selectors
// =============================================================================

export const selectRequestsForInstance = (conversationId: string) =>
  createSelector(
    (state: RootState) => state.activeRequests.byConversationId[conversationId],
    (state: RootState) => state.activeRequests.byRequestId,
    (ids, byRequestId): ActiveRequest[] => {
      if (!ids || ids.length === 0) return [];
      return ids
        .map((id) => byRequestId[id])
        .filter((r): r is ActiveRequest => r != null);
    },
  );

export const selectPrimaryRequest =
  (conversationId: string) =>
  (state: RootState): ActiveRequest | undefined => {
    const ids = state.activeRequests.byConversationId[conversationId];
    if (!ids || ids.length === 0) return undefined;
    return state.activeRequests.byRequestId[ids[ids.length - 1]];
  };

export const selectRequestStatus = (requestId: string) => (state: RootState) =>
  state.activeRequests.byRequestId[requestId]?.status;

/**
 * Derives accumulated text from render blocks (single source of truth).
 * Returns "" when no request exists — safe because "" is a string literal.
 * Memoized so consumers don't re-render unless render block content changes.
 */
export const selectAccumulatedText = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlockOrder,
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlocks,
    (order, blocks): string => {
      if (!order || !blocks || order.length === 0) return "";
      return order
        .map((id) => blocks[id]?.content ?? "")
        .filter(Boolean)
        .join("\n");
    },
  );

export const selectRequestConversationId =
  (requestId: string) =>
  (state: RootState): string | null => {
    const r = state.activeRequests.byRequestId[requestId];
    if (!r) return null;
    return r.conversationId;
  };

export const selectHasActiveRequests = createSelector(
  (state: RootState) => state.activeRequests.byRequestId,
  (byRequestId): boolean =>
    Object.values(byRequestId).some(
      (r) =>
        r.status === "pending" ||
        r.status === "connecting" ||
        r.status === "streaming" ||
        r.status === "awaiting-tools",
    ),
);

// =============================================================================
// Phase Selectors (V2 — replaces status_update)
// =============================================================================

/** The most recent phase for a request. Primitive — safe for useAppSelector. */
export const selectCurrentPhase =
  (requestId: string) =>
  (state: RootState): Phase | null =>
    state.activeRequests.byRequestId[requestId]?.currentPhase ?? null;

/** Full phase history — for timeline / debug views. Memoized. */
export const selectPhaseHistory = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.phaseHistory,
    (phaseHistory): Phase[] | undefined => phaseHistory,
  );

// =============================================================================
// Operation Tracking Selectors (init/completion pairs)
// =============================================================================

/** All currently active (in-flight) operations. */
export const selectActiveOperations =
  (requestId: string) =>
  (state: RootState): Record<string, OperationEntry> | undefined =>
    state.activeRequests.byRequestId[requestId]?.activeOperations;

/** All completed operations. */
export const selectCompletedOperations =
  (requestId: string) =>
  (state: RootState): Record<string, CompletedOperationEntry> | undefined =>
    state.activeRequests.byRequestId[requestId]?.completedOperations;

/**
 * Whether any operations are currently in-flight. Primitive.
 * Uses the activeOperations Record keys count — no Object.values() filter.
 */
export const selectHasActiveOperations =
  (requestId: string) =>
  (state: RootState): boolean => {
    const ops = state.activeRequests.byRequestId[requestId]?.activeOperations;
    if (!ops) return false;
    return Object.keys(ops).length > 0;
  };

/** Completed operations filtered by operation type. Memoized. */
export const selectCompletedOperationsByType = (
  requestId: string,
  operation: Operation,
) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.completedOperations,
    (ops): CompletedOperationEntry[] | undefined => {
      if (!ops) return undefined;
      return Object.values(ops).filter((o) => o.operation === operation);
    },
  );

/** The user_request completion entry (the primary one). */
export const selectUserRequestCompletion =
  (requestId: string) =>
  (state: RootState): CompletedOperationEntry | undefined => {
    const ops =
      state.activeRequests.byRequestId[requestId]?.completedOperations;
    if (!ops) return undefined;
    return Object.values(ops).find((o) => o.operation === "user_request");
  };

// =============================================================================
// Render Block Selectors
// =============================================================================

/** A single render block by blockId. Primitive-ish — object ref stable until upserted. */
export const selectRenderBlock =
  (requestId: string, blockId: string) =>
  (state: RootState): RenderBlockPayload | undefined =>
    state.activeRequests.byRequestId[requestId]?.renderBlocks[blockId];

/** Ordered blockIds for rendering. Stable array ref until a new block arrives. */
export const selectRenderBlockOrder =
  (requestId: string) =>
  (state: RootState): string[] | undefined =>
    state.activeRequests.byRequestId[requestId]?.renderBlockOrder;

/** All render blocks in emission order. Memoized. */
export const selectAllRenderBlocks = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlockOrder,
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlocks,
    (order, blocks): RenderBlockPayload[] | undefined => {
      if (!order || !blocks) return undefined;
      return order
        .map((id) => blocks[id])
        .filter((b): b is RenderBlockPayload => b != null);
    },
  );

/** Content blocks filtered by type (e.g., "code", "flashcards"). Memoized. */
export const selectRenderBlocksByType = (requestId: string, type: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlockOrder,
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlocks,
    (order, blocks): RenderBlockPayload[] | undefined => {
      if (!order || !blocks) return undefined;
      return order
        .map((id) => blocks[id])
        .filter((b): b is RenderBlockPayload => b != null && b.type === type);
    },
  );

/** Blocks still streaming. Memoized. */
export const selectStreamingBlocks = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlockOrder,
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlocks,
    (order, blocks): RenderBlockPayload[] | undefined => {
      if (!order || !blocks) return undefined;
      return order
        .map((id) => blocks[id])
        .filter(
          (b): b is RenderBlockPayload => b != null && b.status === "streaming",
        );
    },
  );

/** Blocks that are complete. Memoized. */
export const selectCompletedBlocks = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlockOrder,
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlocks,
    (order, blocks): RenderBlockPayload[] | undefined => {
      if (!order || !blocks) return undefined;
      return order
        .map((id) => blocks[id])
        .filter(
          (b): b is RenderBlockPayload => b != null && b.status === "complete",
        );
    },
  );

/** How many content blocks exist for this request. Primitive. */
export const selectRenderBlockCount =
  (requestId: string) =>
  (state: RootState): number =>
    state.activeRequests.byRequestId[requestId]?.renderBlockOrder.length ?? 0;

// =============================================================================
// Tool Lifecycle Selectors
// =============================================================================

/** A single tool lifecycle entry by callId. */
export const selectToolLifecycle =
  (requestId: string, callId: string) =>
  (state: RootState): ToolLifecycleEntry | undefined =>
    state.activeRequests.byRequestId[requestId]?.toolLifecycle[callId];

/**
 * Raw tool lifecycle map — use this as input to derived selectors.
 * Stable reference until the map itself changes.
 */
export const selectToolLifecycleMap =
  (requestId: string) =>
  (state: RootState): Record<string, ToolLifecycleEntry> | undefined =>
    state.activeRequests.byRequestId[requestId]?.toolLifecycle;

/** All tool lifecycle entries. Memoized. */
export const selectAllToolLifecycles = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.toolLifecycle,
    (lifecycle): ToolLifecycleEntry[] | undefined =>
      lifecycle ? Object.values(lifecycle) : undefined,
  );

/** Tools that are actively running (started, progress, step). Memoized. */
export const selectActiveTools = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.toolLifecycle,
    (lifecycle): ToolLifecycleEntry[] | undefined => {
      if (!lifecycle) return undefined;
      return Object.values(lifecycle).filter(
        (t) =>
          t.status === "started" ||
          t.status === "progress" ||
          t.status === "step",
      );
    },
  );

/** Tools that completed successfully. Memoized. */
export const selectCompletedTools = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.toolLifecycle,
    (lifecycle): ToolLifecycleEntry[] | undefined => {
      if (!lifecycle) return undefined;
      return Object.values(lifecycle).filter((t) => t.status === "completed");
    },
  );

/** Tools that errored. Memoized. */
export const selectToolErrors = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.toolLifecycle,
    (lifecycle): ToolLifecycleEntry[] | undefined => {
      if (!lifecycle) return undefined;
      return Object.values(lifecycle).filter((t) => t.status === "error");
    },
  );

/**
 * How many tools are currently active. Primitive.
 * Avoids Object.values().filter().length by counting inside the result fn.
 */
export const selectActiveToolCount = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.toolLifecycle,
    (lifecycle): number => {
      if (!lifecycle) return 0;
      let count = 0;
      for (const t of Object.values(lifecycle)) {
        if (
          t.status === "started" ||
          t.status === "progress" ||
          t.status === "step"
        ) {
          count++;
        }
      }
      return count;
    },
  );

/**
 * Ordered list of callIds, in the order their tool_started event appeared
 * in the timeline. Used by inline tool rendering to maintain stream position.
 */
export const selectToolCallIdsInOrder = (requestId: string) =>
  createSelector(
    (state: RootState) => state.activeRequests.byRequestId[requestId]?.timeline,
    (timeline): string[] | undefined => {
      if (!timeline) return undefined;
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const entry of timeline) {
        if (
          entry.kind === "tool_event" &&
          entry.data.event === "tool_started" &&
          !seen.has(entry.data.call_id)
        ) {
          seen.add(entry.data.call_id);
          ordered.push(entry.data.call_id);
        }
      }
      return ordered;
    },
  );

// =============================================================================
// Content Segment Types (kept for DB-turn path and backward compat exports)
// =============================================================================

export type ContentSegmentText = { type: "text"; content: string };
export type ContentSegmentTool = { type: "tool"; callId: string };
export type ContentSegmentStatus = {
  type: "status";
  label: string;
  kind: "phase" | "info";
};
export type ContentSegmentDbTool = {
  type: "db_tool";
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown | null;
  isError: boolean;
};
export type ContentSegmentThinking = {
  type: "thinking";
  content: string;
};
export type ContentSegment =
  | ContentSegmentText
  | ContentSegmentTool
  | ContentSegmentStatus
  | ContentSegmentDbTool
  | ContentSegmentThinking;

// =============================================================================
// Unified Slot Rendering — single source of truth for stream content ordering
// =============================================================================

export type UnifiedSlot =
  | {
      kind: "render_block";
      blockId: string;
      /**
       * The render block's type at the moment the slot was emitted. Lets
       * consumers (e.g. `hasUnifiedSpecial`) decide whether the slot is
       * "special" interleaved content (media, etc.) without re-looking it
       * up in the blocks map. Optional because legacy callsites that build
       * slots from a bare `renderBlockOrder` (no timeline / no blocks map)
       * can't fill it.
       */
      blockType?: string;
      seq: number;
    }
  | { kind: "tool"; callId: string; seq: number }
  | {
      kind: "status";
      label: string;
      statusKind: "phase" | "info";
      seq: number;
    };

/**
 * Render-block types that need the unified-slot rendering path even when
 * there's no text run / tool / status to interleave them with. A pure-image
 * stream (no text_start, just a `data: image_output` event) emits a
 * standalone render_block slot — without this set, `hasUnifiedSpecial`
 * would mistake it for plain text content and skip the unified renderer.
 *
 * Re-exported so EnhancedChatMarkdown can share the canonical list.
 */
export const SPECIAL_RENDER_BLOCK_TYPES = new Set<string>([
  "image_output",
  "audio_output",
  "video_output",
]);

const PHASE_LABELS: Record<string, string> = {
  connected: "Connected",
  processing: "Processing…",
  generating: "Generating…",
  using_tools: "Using tools…",
  persisting: "Saving…",
  searching: "Searching…",
  scraping: "Reading pages…",
  analyzing: "Analyzing…",
  synthesizing: "Synthesizing…",
  retrying: "Retrying…",
  executing: "Executing…",
};

/**
 * Builds an ordered list of unified slots by walking the timeline and
 * merging render blocks with non-text events (tools, status indicators).
 *
 * Render blocks are assigned to the text run they belong to using the
 * blockStartIndex/blockEndIndex stored on text_start/text_end entries.
 * Non-text timeline events (tool_started, phase, info) get their own slots.
 *
 * Status slots are transient: each new status replaces the previous one,
 * and any "real" content event clears the pending status.
 */
// Media data events emit standalone render-block slots (not inside a text
// run). Forward-compatible with audio + video outputs; today only images
// fire data events, but the wiring is identical.
const MEDIA_DATA_TYPES = new Set([
  "image_output",
  "partial_image",
  "audio_output",
  "video_output",
]);

const MEDIA_BLOCK_TYPES = new Set([
  "image_output",
  "audio_output",
  "video_output",
]);

export const selectUnifiedSlots = (requestId: string) =>
  createSelector(
    (state: RootState) => state.activeRequests.byRequestId[requestId]?.timeline,
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlockOrder,
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.renderBlocks,
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.isTextStreaming,
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.isReasoningStreaming,
    (
      timeline,
      renderBlockOrder,
      renderBlocks,
      isTextStreaming,
      isReasoningStreaming,
    ): UnifiedSlot[] => {
      const blockOrder = renderBlockOrder ?? [];
      const blocksMap = renderBlocks ?? {};

      if (!timeline || timeline.length === 0) {
        if (blockOrder.length === 0) return [];
        return blockOrder.map((blockId, i) => ({
          kind: "render_block" as const,
          blockId,
          blockType: blocksMap[blockId]?.type,
          seq: i,
        }));
      }

      const slots: UnifiedSlot[] = [];
      const seenTools = new Set<string>();
      // Tracks every blockId already pushed as a slot (regardless of source
      // — text_end range, reasoning_end trailing, or standalone media data
      // event). Partials and final image_outputs share a blockId, so this
      // also dedupes them: the final upsert updates the block in place and
      // the existing slot picks up the new state via Redux subscription.
      const emittedBlockIds = new Set<string>();
      let nextSeq = 0;
      let pendingStatus: UnifiedSlot | null = null;
      // Tracks how many blocks from renderBlockOrder have been emitted into slots.
      // Used by both text_end and reasoning_end to emit their respective blocks.
      let lastEmittedBlockIndex = 0;

      const pushBlock = (blockId: string) => {
        if (emittedBlockIds.has(blockId)) return;
        emittedBlockIds.add(blockId);
        slots.push({
          kind: "render_block",
          blockId,
          blockType: blocksMap[blockId]?.type,
          seq: nextSeq++,
        });
      };

      for (const entry of timeline) {
        if (entry.kind === "text_start") {
          pendingStatus = null;
        } else if (entry.kind === "text_end") {
          pendingStatus = null;
          const start = entry.blockStartIndex;
          const end = entry.blockEndIndex;
          for (let i = start; i < end && i < blockOrder.length; i++) {
            pushBlock(blockOrder[i]);
          }
          lastEmittedBlockIndex = Math.max(lastEmittedBlockIndex, end);
        } else if (entry.kind === "reasoning_start") {
          pendingStatus = null;
        } else if (entry.kind === "reasoning_end") {
          // Reasoning blocks arrive as render_block events and land in renderBlockOrder.
          // They are NOT covered by text_end block ranges because they aren't part of
          // a text run. Emit any blocks accumulated in renderBlockOrder since the last
          // emission — these are the reasoning block(s) for this reasoning run.
          pendingStatus = null;
          const end = blockOrder.length;
          for (let i = lastEmittedBlockIndex; i < end; i++) {
            pushBlock(blockOrder[i]);
          }
          lastEmittedBlockIndex = end;
        } else if (
          entry.kind === "tool_event" &&
          entry.data.event === "tool_started" &&
          !seenTools.has(entry.data.call_id)
        ) {
          pendingStatus = null;
          seenTools.add(entry.data.call_id);
          slots.push({
            kind: "tool",
            callId: entry.data.call_id,
            seq: nextSeq++,
          });
        } else if (entry.kind === "phase") {
          const label = PHASE_LABELS[entry.data.phase];
          if (label && entry.data.phase !== "complete") {
            pendingStatus = {
              kind: "status",
              label,
              statusKind: "phase",
              seq: nextSeq,
            };
          } else {
            pendingStatus = null;
          }
        } else if (entry.kind === "info" && entry.data.user_message) {
          pendingStatus = {
            kind: "status",
            label: entry.data.user_message,
            statusKind: "info",
            seq: nextSeq,
          };
        } else if (entry.kind === "data") {
          // Media data events (image_output / audio_output / video_output)
          // create standalone render blocks that aren't covered by any
          // text_end or reasoning_end range. Find the matching block in
          // renderBlockOrder (latest, since partials and finals share the
          // same blockId) and emit it as its own slot. Audio + video are
          // forward-compat — today only images fire data events.
          const dataType = entry.data.type;
          if (dataType && MEDIA_DATA_TYPES.has(dataType)) {
            pendingStatus = null;
            for (let i = blockOrder.length - 1; i >= 0; i--) {
              const candidateId = blockOrder[i];
              if (emittedBlockIds.has(candidateId)) continue;
              const candidate = blocksMap[candidateId];
              if (candidate && MEDIA_BLOCK_TYPES.has(candidate.type)) {
                pushBlock(candidateId);
                break;
              }
            }
          }
        } else if (
          entry.kind === "completion" ||
          entry.kind === "end" ||
          entry.kind === "error"
        ) {
          pendingStatus = null;
        }
      }

      // Trailing open text run (still streaming) — emit blocks from
      // lastEmittedBlockIndex to the current end of renderBlockOrder
      if (isTextStreaming) {
        for (let i = lastEmittedBlockIndex; i < blockOrder.length; i++) {
          pushBlock(blockOrder[i]);
        }
      }

      // Trailing active reasoning run — reasoning_start fired but reasoning_end has not
      // yet. Any render_block events that arrived since the last emission belong to this
      // reasoning run (e.g. type: "reasoning", blockId: "client_reasoning_1").
      if (isReasoningStreaming) {
        for (let i = lastEmittedBlockIndex; i < blockOrder.length; i++) {
          pushBlock(blockOrder[i]);
        }
      }

      if (pendingStatus) {
        pendingStatus.seq = nextSeq++;
        slots.push(pendingStatus);
      }

      // Fallback: timeline exists but produced no slots, yet blocks exist
      if (slots.length === 0 && blockOrder.length > 0) {
        return blockOrder.map((blockId, i) => ({
          kind: "render_block" as const,
          blockId,
          blockType: blocksMap[blockId]?.type,
          seq: i,
        }));
      }

      return slots;
    },
  );

/** Pending tool calls that haven't been resolved yet. Memoized. */
export const selectUnresolvedToolCalls = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.pendingToolCalls,
    (pendingToolCalls) => {
      if (!pendingToolCalls) return undefined;
      return pendingToolCalls.filter((c) => !c.resolved);
    },
  );

// =============================================================================
// Completion Selectors
// =============================================================================

/** The completion payload for a request. null until completion event fires. */
export const selectCompletion =
  (requestId: string) =>
  (state: RootState): CompletionPayload | null =>
    state.activeRequests.byRequestId[requestId]?.completion ?? null;

// =============================================================================
// Typed Completion Result Selectors
//
// Each operation type has a known result shape from the auto-generated types.
// These selectors narrow the untyped Record<string, unknown> to the correct
// interface so components never need to cast.
// =============================================================================

type OperationResultMap = {
  user_request: UserRequestResult;
  llm_request: LlmRequestResult;
  tool_execution: ToolExecutionResult;
  sub_agent: SubAgentResult;
  persistence: PersistenceResult;
};

function getTypedResult<T extends Operation>(
  ops: Record<string, CompletedOperationEntry> | undefined,
  operation: T,
): OperationResultMap[T] | undefined {
  if (!ops) return undefined;
  const entry = Object.values(ops).find((o) => o.operation === operation);
  return entry?.result as OperationResultMap[T] | undefined;
}

function getAllTypedResults<T extends Operation>(
  ops: Record<string, CompletedOperationEntry> | undefined,
  operation: T,
): OperationResultMap[T][] | undefined {
  if (!ops) return undefined;
  return Object.values(ops)
    .filter((o) => o.operation === operation)
    .map((o) => o.result as OperationResultMap[T]);
}

/** The user_request result with full usage, timing, and tool call stats. */
export const selectUserRequestResult =
  (requestId: string) =>
  (state: RootState): UserRequestResult | undefined =>
    getTypedResult(
      state.activeRequests.byRequestId[requestId]?.completedOperations,
      "user_request",
    );

/** All LLM request results (one per iteration). */
export const selectLlmRequestResults = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.completedOperations,
    (ops): LlmRequestResult[] | undefined =>
      getAllTypedResults(ops, "llm_request"),
  );

/** All tool execution results. */
export const selectToolExecutionResults = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.completedOperations,
    (ops): ToolExecutionResult[] | undefined =>
      getAllTypedResults(ops, "tool_execution"),
  );

/** All sub-agent results. */
export const selectSubAgentResults = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.completedOperations,
    (ops): SubAgentResult[] | undefined => getAllTypedResults(ops, "sub_agent"),
  );

/** All persistence results. */
export const selectPersistenceResults = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.completedOperations,
    (ops): PersistenceResult[] | undefined =>
      getAllTypedResults(ops, "persistence"),
  );

// =============================================================================
// Typed Data Payload Selectors
//
// Data events carry a `type` discriminator. These selectors narrow the
// untyped dataPayloads array to the correct TypedDataPayload interface.
// =============================================================================

type DataTypeMap = {
  audio_output: AudioOutputData;
  categorization_result: CategorizationResultData;
  conversation_id: ConversationIdData;
  conversation_labeled: ConversationLabeledData;
  display_questionnaire: QuestionnaireDisplayData;
  fetch_results: FetchResultsData;
  function_result: FunctionResultData;
  image_output: ImageOutputData;
  podcast_complete: PodcastCompleteData;
  podcast_stage: PodcastStageData;
  scrape_batch_complete: ScrapeBatchCompleteData;
  search_error: SearchErrorData;
  search_results: SearchResultsData;
  structured_input_warning: StructuredInputWarningData;
  video_output: VideoOutputData;
  workflow_step: WorkflowStepData;
};

type DataTypeName = keyof DataTypeMap;

/**
 * Generic typed data selector factory. Returns all data payloads matching
 * the given type discriminator, narrowed to the correct interface.
 *
 * Usage: const results = useAppSelector(selectTypedDataPayloads(requestId, "search_results"));
 *        // results is SearchResultsData[] | undefined
 */
export const selectTypedDataPayloads = <T extends DataTypeName>(
  requestId: string,
  dataType: T,
) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.dataPayloads,
    (payloads): DataTypeMap[T][] | undefined => {
      if (!payloads) return undefined;
      return payloads.filter((p) => p.type === dataType) as DataTypeMap[T][];
    },
  );

/** First data payload of the given type, or undefined. */
export const selectFirstTypedDataPayload =
  <T extends DataTypeName>(requestId: string, dataType: T) =>
  (state: RootState): DataTypeMap[T] | undefined => {
    const payloads = state.activeRequests.byRequestId[requestId]?.dataPayloads;
    if (!payloads) return undefined;
    return payloads.find((p) => p.type === dataType) as
      | DataTypeMap[T]
      | undefined;
  };

/** All data payloads as a typed union. Memoized. */
export const selectAllTypedDataPayloads = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.dataPayloads,
    (payloads): (TypedDataPayload | UntypedDataPayload)[] | undefined =>
      payloads,
  );

/** Distinct data types received for this request. Memoized. */
export const selectReceivedDataTypes = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.dataPayloads,
    (payloads): string[] | undefined => {
      if (!payloads) return undefined;
      const types = new Set<string>();
      for (const p of payloads) {
        types.add(p.type);
      }
      return Array.from(types);
    },
  );

// =============================================================================
// Reasoning Selectors
// =============================================================================

/**
 * Accumulated reasoning text. Returns "" when no request exists — string
 * literal default is safe (stable reference, no new-ref churn).
 */
export const selectAccumulatedReasoning =
  (requestId: string) =>
  (state: RootState): string =>
    state.activeRequests.byRequestId[requestId]?.accumulatedReasoning ?? "";

/** Whether reasoning tokens are currently streaming. Primitive. */
export const selectIsReasoningStreaming =
  (requestId: string) =>
  (state: RootState): boolean =>
    state.activeRequests.byRequestId[requestId]?.isReasoningStreaming ?? false;

/** Whether any reasoning content exists for this request. Primitive. */
export const selectHasReasoning =
  (requestId: string) =>
  (state: RootState): boolean =>
    (state.activeRequests.byRequestId[requestId]?.reasoningChunks.length ?? 0) >
    0;

// =============================================================================
// Warning Selectors
// =============================================================================

/** All structured warnings for a request. Stable ref — only grows. */
export const selectWarnings =
  (requestId: string) =>
  (state: RootState): WarningPayload[] | undefined =>
    state.activeRequests.byRequestId[requestId]?.warnings;

/** Warning count. Primitive. */
export const selectWarningCount =
  (requestId: string) =>
  (state: RootState): number =>
    state.activeRequests.byRequestId[requestId]?.warnings.length ?? 0;

/** High-severity warnings only. Memoized. */
export const selectHighWarnings = (requestId: string) =>
  createSelector(
    (state: RootState) => state.activeRequests.byRequestId[requestId]?.warnings,
    (warnings): WarningPayload[] | undefined => {
      if (!warnings) return undefined;
      return warnings.filter((w) => w.level === "high");
    },
  );

// =============================================================================
// Info Event Selectors
// =============================================================================

/** All info events for a request. Stable ref — only grows. */
export const selectInfoEvents =
  (requestId: string) =>
  (state: RootState): InfoPayload[] | undefined =>
    state.activeRequests.byRequestId[requestId]?.infoEvents;

// =============================================================================
// Record Reservation Selectors
// =============================================================================

/** All reservations for a request. Stable ref. */
export const selectReservations =
  (requestId: string) =>
  (state: RootState): Record<string, ReservationRecord> | undefined =>
    state.activeRequests.byRequestId[requestId]?.reservations;

/** A single reservation by record_id. */
export const selectReservation =
  (requestId: string, recordId: string) =>
  (state: RootState): ReservationRecord | undefined =>
    state.activeRequests.byRequestId[requestId]?.reservations[recordId];

/** Reservations filtered by table name. Memoized. */
export const selectReservationsByTable = (requestId: string, table: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.reservations,
    (reservations): ReservationRecord[] | undefined => {
      if (!reservations) return undefined;
      return Object.values(reservations).filter((r) => r.table === table);
    },
  );

/** Reservations still in pending status. Memoized. */
export const selectPendingReservations = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.reservations,
    (reservations): ReservationRecord[] | undefined => {
      if (!reservations) return undefined;
      return Object.values(reservations).filter((r) => r.status === "pending");
    },
  );

/** Reservations that have failed. Memoized. */
export const selectFailedReservations = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.reservations,
    (reservations): ReservationRecord[] | undefined => {
      if (!reservations) return undefined;
      return Object.values(reservations).filter((r) => r.status === "failed");
    },
  );

/** Total count of reservations. Primitive. */
export const selectReservationCount =
  (requestId: string) =>
  (state: RootState): number => {
    const reservations =
      state.activeRequests.byRequestId[requestId]?.reservations;
    if (!reservations) return 0;
    return Object.keys(reservations).length;
  };

/** The conversation_id from the cx_conversation reservation, if available. */
export const selectReservedConversationId =
  (requestId: string) =>
  (state: RootState): string | null => {
    const reservations =
      state.activeRequests.byRequestId[requestId]?.reservations;
    if (!reservations) return null;
    const conv = Object.values(reservations).find(
      (r) => r.table === "cx_conversation",
    );
    return conv?.recordId ?? null;
  };

// =============================================================================
// Error Selectors
// =============================================================================

/**
 * Whether this request ended in a fatal error. The backend has no `is_fatal`
 * field on the wire — error events ARE fatal by definition (stream killed),
 * so we derive this purely from `request.status === "error"`.
 */
export const selectErrorIsFatal =
  (requestId: string) =>
  (state: RootState): boolean =>
    state.activeRequests.byRequestId[requestId]?.status === "error";

// =============================================================================
// Conversation Tree
// =============================================================================

export const selectConversationTree = (conversationId: string) =>
  createSelector(
    (state: RootState) => state.activeRequests.byConversationId[conversationId],
    (state: RootState) => state.activeRequests.byRequestId,
    (
      ids,
      byRequestId,
    ): {
      root: ActiveRequest | null;
      children: Record<string, ActiveRequest[]>;
    } => {
      const requests = (ids ?? [])
        .map((id) => byRequestId[id])
        .filter((r): r is ActiveRequest => r != null);

      const root =
        requests.find((r) => r.parentConversationId === null) ?? null;
      const children: Record<string, ActiveRequest[]> = {};

      for (const req of requests) {
        if (req.parentConversationId) {
          if (!children[req.parentConversationId]) {
            children[req.parentConversationId] = [];
          }
          children[req.parentConversationId].push(req);
        }
      }

      return { root, children };
    },
  );

// =============================================================================
// Timeline Selectors
// =============================================================================

/** The full timeline for a request. Stable ref — only grows. */
export const selectTimeline =
  (requestId: string) =>
  (state: RootState): TimelineEntry[] | undefined =>
    state.activeRequests.byRequestId[requestId]?.timeline;

/** The raw event log — every event before processing. Stable ref — only grows. */
export const selectRawEvents =
  (requestId: string) =>
  (state: RootState): RawStreamEvent[] | undefined =>
    state.activeRequests.byRequestId[requestId]?.rawEvents;

/** Timeline length. Primitive — safe for useAppSelector. */
export const selectTimelineLength =
  (requestId: string) =>
  (state: RootState): number =>
    state.activeRequests.byRequestId[requestId]?.timeline.length ?? 0;

/** Whether text is currently streaming (inside a text_start..text_end run). */
export const selectIsInTextRun =
  (requestId: string) =>
  (state: RootState): boolean =>
    state.activeRequests.byRequestId[requestId]?.isTextStreaming ?? false;

/** Timeline filtered to a specific kind. Memoized. */
export const selectTimelineByKind = (
  requestId: string,
  kind: TimelineEntry["kind"],
) =>
  createSelector(
    (state: RootState) => state.activeRequests.byRequestId[requestId]?.timeline,
    (timeline): TimelineEntry[] | undefined => {
      if (!timeline) return undefined;
      return timeline.filter((e) => e.kind === kind);
    },
  );

/** Count of timeline entries by kind. Memoized. */
export const selectTimelineKindCounts = (requestId: string) =>
  createSelector(
    (state: RootState) => state.activeRequests.byRequestId[requestId]?.timeline,
    (timeline): Record<string, number> | undefined => {
      if (!timeline) return undefined;
      const counts: Record<string, number> = {};
      for (const entry of timeline) {
        counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
      }
      return counts;
    },
  );

// =============================================================================
// Timeline-Derived Timing
// =============================================================================

export interface TimelineDerivedTiming {
  /** Delta from request start (timeline[0]) to first phase event */
  timeToFirstPhaseMs: number | null;
  /** Delta from request start to first text_start */
  timeToFirstTextMs: number | null;
  /** Delta from request start to first reasoning_start */
  timeToFirstReasoningMs: number | null;
  /** Delta from request start to first init event */
  timeToFirstInitMs: number | null;
  /** Sum of all text_start→text_end durations */
  textStreamingDurationMs: number;
  /** Sum of all reasoning_start→reasoning_end durations */
  reasoningStreamingDurationMs: number;
  /** Sum of all tool_started→tool_completed durations (by callId) */
  toolExecutionDurationMs: number;
  /** Total stream time minus text streaming time minus tool time */
  interstitialDurationMs: number | null;
  /** Total timeline span: last entry timestamp - first entry timestamp */
  totalTimelineDurationMs: number | null;
  /** Number of distinct text runs */
  textRunCount: number;
  /** Number of distinct reasoning runs */
  reasoningRunCount: number;
  /** Number of distinct tool calls tracked */
  toolCallCount: number;
  /** Number of record_reserved events */
  reservationCount: number;
  /** Number of warning events */
  warningCount: number;
  /** Number of info events */
  infoCount: number;
}

const EMPTY_TIMING: TimelineDerivedTiming = {
  timeToFirstPhaseMs: null,
  timeToFirstTextMs: null,
  timeToFirstReasoningMs: null,
  timeToFirstInitMs: null,
  textStreamingDurationMs: 0,
  reasoningStreamingDurationMs: 0,
  toolExecutionDurationMs: 0,
  interstitialDurationMs: null,
  totalTimelineDurationMs: null,
  textRunCount: 0,
  reasoningRunCount: 0,
  toolCallCount: 0,
  reservationCount: 0,
  warningCount: 0,
  infoCount: 0,
};

/**
 * Walk the timeline once and compute precise timing metrics.
 * Memoized — only recomputes when the timeline array ref changes.
 */
export const selectTimelineDerivedTiming = (requestId: string) =>
  createSelector(
    (state: RootState) => state.activeRequests.byRequestId[requestId]?.timeline,
    (timeline): TimelineDerivedTiming => {
      if (!timeline || timeline.length === 0) return EMPTY_TIMING;

      const origin = timeline[0].timestamp;
      let timeToFirstPhaseMs: number | null = null;
      let timeToFirstTextMs: number | null = null;
      let timeToFirstReasoningMs: number | null = null;
      let timeToFirstInitMs: number | null = null;
      let textStreamingDurationMs = 0;
      let reasoningStreamingDurationMs = 0;
      let textRunCount = 0;
      let reasoningRunCount = 0;

      let currentTextRunStart: number | null = null;
      let currentReasoningRunStart: number | null = null;

      const toolStarts = new Map<string, number>();
      let toolExecutionDurationMs = 0;
      let toolCallCount = 0;
      let reservationCount = 0;
      let warningCount = 0;
      let infoCount = 0;

      for (const entry of timeline) {
        switch (entry.kind) {
          case "phase":
            if (timeToFirstPhaseMs === null) {
              timeToFirstPhaseMs = entry.timestamp - origin;
            }
            break;

          case "init":
            if (timeToFirstInitMs === null) {
              timeToFirstInitMs = entry.timestamp - origin;
            }
            break;

          case "text_start":
            if (timeToFirstTextMs === null) {
              timeToFirstTextMs = entry.timestamp - origin;
            }
            currentTextRunStart = entry.timestamp;
            textRunCount++;
            break;

          case "text_end":
            if (currentTextRunStart !== null) {
              textStreamingDurationMs += entry.timestamp - currentTextRunStart;
              currentTextRunStart = null;
            }
            break;

          case "reasoning_start":
            if (timeToFirstReasoningMs === null) {
              timeToFirstReasoningMs = entry.timestamp - origin;
            }
            currentReasoningRunStart = entry.timestamp;
            reasoningRunCount++;
            break;

          case "reasoning_end":
            if (currentReasoningRunStart !== null) {
              reasoningStreamingDurationMs +=
                entry.timestamp - currentReasoningRunStart;
              currentReasoningRunStart = null;
            }
            break;

          case "tool_event":
            if (entry.data.event === "tool_started") {
              toolStarts.set(entry.data.call_id, entry.timestamp);
            } else if (
              entry.data.event === "tool_completed" ||
              entry.data.event === "tool_error"
            ) {
              const start = toolStarts.get(entry.data.call_id);
              if (start !== undefined) {
                toolExecutionDurationMs += entry.timestamp - start;
                toolStarts.delete(entry.data.call_id);
                toolCallCount++;
              }
            }
            break;

          case "record_reserved":
            reservationCount++;
            break;

          case "warning":
            warningCount++;
            break;

          case "info":
            infoCount++;
            break;
        }
      }

      const last = timeline[timeline.length - 1];
      const totalTimelineDurationMs = last.timestamp - origin;

      const interstitialDurationMs =
        totalTimelineDurationMs > 0
          ? totalTimelineDurationMs -
            textStreamingDurationMs -
            reasoningStreamingDurationMs -
            toolExecutionDurationMs
          : null;

      return {
        timeToFirstPhaseMs,
        timeToFirstTextMs,
        timeToFirstReasoningMs,
        timeToFirstInitMs,
        textStreamingDurationMs,
        reasoningStreamingDurationMs,
        toolExecutionDurationMs,
        interstitialDurationMs,
        totalTimelineDurationMs,
        textRunCount,
        reasoningRunCount,
        toolCallCount,
        reservationCount,
        warningCount,
        infoCount,
      };
    },
  );

// =============================================================================
// JSON Extraction Selectors
// =============================================================================

/** All extracted JSON values for a request. null = extraction not enabled. */
export const selectExtractedJson =
  (requestId: string) =>
  (state: RootState): ExtractedJsonSnapshot[] | null =>
    state.activeRequests.byRequestId[requestId]?.extractedJson ?? null;

/** First extracted JSON object (not array, not primitive). */
export const selectFirstExtractedObject =
  (requestId: string) =>
  (state: RootState): ExtractedJsonSnapshot | null => {
    const results = state.activeRequests.byRequestId[requestId]?.extractedJson;
    if (!results) return null;
    return results.find((r) => r.type === "object") ?? null;
  };

/** First extracted JSON value of any type. */
export const selectFirstExtractedJson =
  (requestId: string) =>
  (state: RootState): ExtractedJsonSnapshot | null => {
    const results = state.activeRequests.byRequestId[requestId]?.extractedJson;
    if (!results || results.length === 0) return null;
    return results[0];
  };

/** Whether JSON extraction has completed its final pass. Primitive. */
export const selectJsonExtractionComplete =
  (requestId: string) =>
  (state: RootState): boolean =>
    state.activeRequests.byRequestId[requestId]?.jsonExtractionComplete ??
    false;

/** Monotonic revision counter — for avoiding redundant work in consumers. Primitive. */
export const selectJsonExtractionRevision =
  (requestId: string) =>
  (state: RootState): number =>
    state.activeRequests.byRequestId[requestId]?.jsonExtractionRevision ?? 0;

/** Whether all extracted JSON structures are complete (balanced). Primitive. */
export const selectAllJsonComplete =
  (requestId: string) =>
  (state: RootState): boolean => {
    const results = state.activeRequests.byRequestId[requestId]?.extractedJson;
    if (!results || results.length === 0) return false;
    return results.every((r) => r.isComplete);
  };

/** Count of extracted JSON values. Primitive. */
export const selectExtractedJsonCount =
  (requestId: string) =>
  (state: RootState): number =>
    state.activeRequests.byRequestId[requestId]?.extractedJson?.length ?? 0;
