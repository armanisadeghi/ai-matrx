/**
 * lib/chat-protocol/from-stream.ts
 *
 * Converts raw TypedStreamEvent arrays into CanonicalBlock[] / StreamingState.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * • Zero platform deps — pure TypeScript, no JSX, no React.
 * • Single source of truth — all stream-to-canonical logic lives here.
 * • Immutable output — every returned object is readonly.
 * • Event engine stays here — no consumer should pick through TypedStreamEvent[].
 *
 * STREAM CONTRACT (backend ToolEventPayload.event values)
 * ────────────────────────────────────────────────────────
 *   tool_started        → creates ToolCallBlock (phase: 'running')
 *   tool_progress       → appends ToolProgress to existing block
 *   tool_step           → appends ToolProgress to existing block
 *   tool_result_preview → appends ToolProgress to existing block
 *   tool_completed      → sets output, phase: 'complete'
 *   tool_error          → sets error, phase: 'error'
 *   chunk               → appends to / creates TextBlock
 *   reasoning_chunk     → appends to / creates ThinkingBlock
 *   error               → creates ErrorBlock
 */

import type { TypedStreamEvent } from "@/types/python-generated/stream-events";

import type {
  CanonicalBlock,
  TextBlock,
  ToolCallBlock,
  ThinkingBlock,
  ErrorBlock,
  ToolInput,
  ToolOutput,
  ToolProgress,
  StreamingState,
  CanonicalMessage,
  MessageStatus,
} from "./types";

import { PROTOCOL_VERSION } from "./types";

// ============================================================================
// INTERNAL MUTABLE TYPES (never leave this module)
// ============================================================================

/** Mutable counterpart of ToolCallBlock used while building. */
interface MutableToolCallBlock {
  type: "tool_call";
  callId: string;
  toolName: string;
  input: ToolInput;
  output?: ToolOutput;
  error?: { message: string };
  progress: ToolProgress[];
  phase: "pending" | "running" | "complete" | "error";
}

/** Mutable counterpart of TextBlock used while building. */
interface MutableTextBlock {
  type: "text";
  content: string;
}

/** Mutable counterpart of ThinkingBlock used while building. */
interface MutableThinkingBlock {
  type: "thinking";
  content: string;
}

type MutableBlock =
  | MutableTextBlock
  | MutableToolCallBlock
  | MutableThinkingBlock
  | ErrorBlock;

// ============================================================================
// CORE BUILDER
// ============================================================================

/**
 * Incrementally converts a stream of StreamEvents into an ordered array of
 * canonical blocks.
 *
 * Call this once on a complete array, or call it progressively in real time
 * (the function is pure and O(n) — safe to call on every new event batch).
 */
export function buildCanonicalBlocks(
  events: TypedStreamEvent[],
): CanonicalBlock[] {
  const blocks: MutableBlock[] = [];

  /** Index in `blocks` by tool callId — O(1) lookup for subsequent events. */
  const toolIndex = new Map<string, number>();

  // ------------------------------------------------------------------
  function getOrCreateToolBlock(callId: string, toolName: string): number {
    const existingIdx = toolIndex.get(callId);
    if (existingIdx !== undefined) return existingIdx;
    const idx = blocks.length;
    blocks.push({
      type: "tool_call",
      callId,
      toolName,
      input: { name: toolName, arguments: {} },
      progress: [],
      phase: "pending",
    });
    toolIndex.set(callId, idx);
    return idx;
  }
  // ------------------------------------------------------------------

  for (const event of events) {
    // ── Text chunk ──────────────────────────────────────────────────
    if (event.event === "chunk") {
      const text = event.data.text;
      if (!text) continue;

      const last = blocks[blocks.length - 1];
      if (last && last.type === "text") {
        (last as MutableTextBlock).content += text;
      } else {
        blocks.push({ type: "text", content: text });
      }
      continue;
    }

    if (event.event === "reasoning_chunk") {
      const text = event.data.text;
      if (!text) continue;

      const last = blocks[blocks.length - 1];
      if (last && last.type === "thinking") {
        (last as MutableThinkingBlock).content += text;
      } else {
        blocks.push({ type: "thinking", content: text });
      }
      continue;
    }

    // ── Tool event ──────────────────────────────────────────────────
    if (event.event === "tool_event") {
      const te = event.data;
      const { call_id: callId, tool_name: toolName, message } = te;
      // MATRX-EXCEPTION: `data` is genuinely optional on ToolEventPayload (not
      // every tool event carries a payload) — this is a local read-only
      // default, never written back or persisted.
      const data: Record<string, unknown> = te.data ?? {};

      switch (te.event) {
        case "tool_started": {
          const idx = getOrCreateToolBlock(callId, toolName);
          const tb = blocks[idx] as MutableToolCallBlock;
          const args = data.arguments;
          tb.input = {
            name: toolName,
            arguments:
              args && typeof args === "object" && !Array.isArray(args)
                ? (args as Record<string, unknown>)
                : {},
          };
          tb.phase = "running";
          if (message) tb.progress.push({ message });
          break;
        }

        case "tool_progress":
        case "tool_step":
        case "tool_result_preview": {
          // Ensure block exists (may receive progress before started in edge cases)
          const idx = getOrCreateToolBlock(callId, toolName);
          const tb = blocks[idx] as MutableToolCallBlock;
          if (message) tb.progress.push({ message });
          break;
        }

        case "tool_completed": {
          const idx = getOrCreateToolBlock(callId, toolName);
          const tb = blocks[idx] as MutableToolCallBlock;
          tb.output = {
            status: "success",
            result: data.result ?? data,
          };
          tb.phase = "complete";
          if (message) tb.progress.push({ message });
          break;
        }

        case "tool_error": {
          const idx = getOrCreateToolBlock(callId, toolName);
          const tb = blocks[idx] as MutableToolCallBlock;
          tb.error = { message: message ?? "Tool execution failed" };
          tb.phase = "error";
          break;
        }
      }
      continue;
    }

    // ── Stream-level error ──────────────────────────────────────────
    if (event.event === "error") {
      const err = event.data;
      blocks.push({
        type: "error",
        errorType: err.error_type,
        message: err.message,
      });
      continue;
    }

    // All other events (status_update, broker, heartbeat, end, completion)
    // carry no renderable content — intentionally ignored.
  }

  // Mutable-block shapes are structurally identical to their CanonicalBlock
  // counterparts (only the `readonly` modifiers differ, plus MediaBlock/
  // ErrorBlock which this builder never constructs directly) — TS accepts a
  // mutable object where its readonly counterpart is expected, so no cast.
  return blocks;
}

// ============================================================================
// STREAMING STATE — live view for active streams
// ============================================================================

/**
 * Build a live StreamingState from the events received so far.
 *
 * This is a pure function — call it on every new event batch during streaming.
 * The output is immutable and safe to pass directly to renderers.
 */
export function buildStreamingState(
  events: TypedStreamEvent[],
): StreamingState {
  const blocks = buildCanonicalBlocks(events);

  // Determine whether the stream is still live (no 'end' or stream-level 'error')
  const hasEnd = events.some((e) => e.event === "end");
  const hasError = events.some((e) => e.event === "error");
  const isLive = !hasEnd && !hasError;

  const streamError = blocks.find((b): b is ErrorBlock => b.type === "error");

  return {
    blocks,
    isLive,
    streamError,
  };
}

// ============================================================================
// PERSISTENCE HELPER — extract what should be saved after a stream completes
// ============================================================================

/**
 * Extract the persistable subset of tool blocks from a completed stream.
 *
 * Progress notifications are stripped — only the final input/output/error
 * state needs to be stored in the DB.
 */
export function extractPersistableToolBlocks(
  events: TypedStreamEvent[],
): ReadonlyArray<ToolCallBlock> {
  const blocks = buildCanonicalBlocks(events);
  return blocks.filter((b): b is ToolCallBlock => b.type === "tool_call");
}

// ============================================================================
// FULL MESSAGE BUILDER — for a completed / DB-loaded message
// ============================================================================

/**
 * Build a complete CanonicalMessage from a finished stream.
 *
 * Typically called in the `onComplete` callback of a streaming hook,
 * immediately before the message is persisted and the stream events cleared.
 */
export function buildCanonicalMessageFromStream(params: {
  id: string;
  timestamp?: Date;
  status?: MessageStatus;
  events: TypedStreamEvent[];
}): CanonicalMessage {
  const { id, timestamp = new Date(), status = "complete", events } = params;
  return {
    id,
    role: "assistant",
    timestamp,
    status,
    isCondensed: false,
    blocks: buildCanonicalBlocks(events),
    schemaVersion: PROTOCOL_VERSION,
  };
}
